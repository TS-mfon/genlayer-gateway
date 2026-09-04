// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouteRegistry } from "./GatewayRouteRegistry.sol";
import { IGatewayBytesCallback } from "./interfaces/IGatewayBytesCallback.sol";
import { ITransportAdapter } from "./interfaces/ITransportAdapter.sol";

contract GatewayRouterV2 {
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 public constant REQUEST_FEE = 0.001 ether;
    uint256 public constant MAX_ARGUMENT_BYTES = 32_768;
    uint256 public constant CALLBACK_GAS_LIMIT = 500_000;
    uint8 public constant PROTOCOL_VERSION = 2;

    enum Status {
        None,
        Dispatched,
        Finalized,
        CallbackPending,
        CallbackExecuted
    }

    struct Request {
        address requester;
        address callback;
        bytes32 routeId;
        address destinationContract;
        bytes4 methodSelector;
        bytes32 argumentSchema;
        bytes32 resultSchema;
        bytes32 argumentsHash;
        uint64 nonce;
        uint64 expiry;
        bytes32 outboundMessageId;
        bytes32 resultTxHash;
        bytes32 resultHash;
        Status status;
        bool callbackLocked;
    }

    error TestnetOnly(uint256 chainId);
    error Unauthorized(address caller);
    error InvalidAddress();
    error InvalidFee(uint256 paid, uint256 required);
    error InvalidExpiry();
    error InvalidArguments();
    error InvalidRoute(bytes32 routeId);
    error DuplicateRequest(bytes32 requestId);
    error UnknownRequest(bytes32 requestId);
    error InvalidRequestState(bytes32 requestId, Status status);
    error InvalidResult();
    error CallbackReentrancy();
    error NothingToWithdraw();
    error TransferFailed();

    event RouteRequestDispatched(
        bytes32 indexed requestId, bytes32 indexed routeId, bytes32 indexed messageId
    );
    event RouteResultFinalized(
        bytes32 indexed requestId, bytes32 indexed routeId, bytes32 resultTxHash, bytes32 resultHash
    );
    event CallbackAttempted(bytes32 indexed requestId, bool succeeded);
    event ResultReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    address public owner;
    ITransportAdapter public transport;
    GatewayRouteRegistry public immutable routeRegistry;
    address public resultReceiver;
    uint256 public accruedFees;
    mapping(bytes32 => Request) public requests;
    mapping(address => uint64) public latestNonce;

    constructor(address initialOwner, address initialTransport, address registry_) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert TestnetOnly(block.chainid);
        if (initialOwner == address(0) || initialTransport == address(0) || registry_ == address(0))
        {
            revert InvalidAddress();
        }
        owner = initialOwner;
        transport = ITransportAdapter(initialTransport);
        routeRegistry = GatewayRouteRegistry(registry_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }
    modifier onlyResultReceiver() {
        if (msg.sender != resultReceiver) revert Unauthorized(msg.sender);
        _;
    }

    function requestRoute(
        bytes32 routeId,
        bytes calldata arguments_,
        address callback,
        uint64 nonce,
        uint64 expiry
    ) external payable returns (bytes32 requestId, bytes32 messageId) {
        GatewayRouteRegistry.Route memory route = routeRegistry.getRoute(routeId);
        if (!route.active || route.destinationContract == address(0)) revert InvalidRoute(routeId);
        if (callback == address(0)) revert InvalidAddress();
        if (arguments_.length == 0 || arguments_.length > MAX_ARGUMENT_BYTES) {
            revert InvalidArguments();
        }
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (msg.value != REQUEST_FEE) revert InvalidFee(msg.value, REQUEST_FEE);
        if (nonce <= latestNonce[msg.sender]) revert DuplicateRequest(bytes32(uint256(nonce)));

        bytes32 argumentsHash = keccak256(arguments_);
        requestId = keccak256(
            abi.encode(
                PROTOCOL_VERSION,
                block.chainid,
                address(this),
                msg.sender,
                callback,
                routeId,
                route.destinationContract,
                route.methodSelector,
                route.argumentSchema,
                route.resultSchema,
                argumentsHash,
                nonce,
                expiry
            )
        );
        if (requests[requestId].status != Status.None) revert DuplicateRequest(requestId);
        bytes memory payload = abi.encode(
            PROTOCOL_VERSION,
            requestId,
            routeId,
            block.chainid,
            address(this),
            msg.sender,
            callback,
            nonce,
            expiry,
            route.destinationContract,
            route.methodSelector,
            route.argumentSchema,
            route.resultSchema,
            arguments_,
            argumentsHash
        );
        uint256 deliveryFee = transport.quoteDispatch(payload);
        if (deliveryFee > msg.value) revert InvalidFee(msg.value, deliveryFee);
        latestNonce[msg.sender] = nonce;
        requests[requestId] = Request(
            msg.sender,
            callback,
            routeId,
            route.destinationContract,
            route.methodSelector,
            route.argumentSchema,
            route.resultSchema,
            argumentsHash,
            nonce,
            expiry,
            bytes32(0),
            bytes32(0),
            bytes32(0),
            Status.Dispatched,
            false
        );
        messageId = transport.dispatch{ value: deliveryFee }(payload);
        requests[requestId].outboundMessageId = messageId;
        accruedFees += msg.value - deliveryFee;
        emit RouteRequestDispatched(requestId, routeId, messageId);
    }

    function handleResult(bytes32 requestId, bytes32 resultTxHash, bytes calldata result)
        external
        onlyResultReceiver
    {
        Request storage request = requests[requestId];
        if (request.status == Status.None) revert UnknownRequest(requestId);
        if (request.status != Status.Dispatched) {
            revert InvalidRequestState(requestId, request.status);
        }
        if (block.timestamp > request.expiry || resultTxHash == bytes32(0) || result.length == 0) {
            revert InvalidResult();
        }
        request.resultTxHash = resultTxHash;
        request.resultHash = keccak256(result);
        request.status = Status.Finalized;
        emit RouteResultFinalized(requestId, request.routeId, resultTxHash, request.resultHash);
        _attemptCallback(requestId, request, result);
    }

    function getRequest(bytes32 requestId) external view returns (Request memory) {
        return requests[requestId];
    }

    function retryCallback(bytes32 requestId, bytes calldata result) external returns (bool) {
        Request storage request = requests[requestId];
        if (request.status != Status.CallbackPending) {
            revert InvalidRequestState(requestId, request.status);
        }
        if (keccak256(result) != request.resultHash) revert InvalidResult();
        return _attemptCallback(requestId, request, result);
    }

    function setResultReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert InvalidAddress();
        address oldReceiver = resultReceiver;
        resultReceiver = receiver;
        emit ResultReceiverUpdated(oldReceiver, receiver);
    }

    function setTransport(address newTransport) external onlyOwner {
        if (newTransport == address(0)) revert InvalidAddress();
        transport = ITransportAdapter(newTransport);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function withdrawFees(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;
        (bool sent,) = recipient.call{ value: amount }("");
        if (!sent) revert TransferFailed();
    }

    function _attemptCallback(bytes32 requestId, Request storage request, bytes calldata result)
        internal
        returns (bool succeeded)
    {
        if (request.callbackLocked) revert CallbackReentrancy();
        request.callbackLocked = true;
        request.status = Status.CallbackPending;
        bytes memory data = abi.encodeCall(
            IGatewayBytesCallback.onGatewayResult,
            (requestId, request.routeId, request.resultTxHash, result)
        );
        (succeeded,) = request.callback.call{ gas: CALLBACK_GAS_LIMIT }(data);
        if (succeeded) request.status = Status.CallbackExecuted;
        else request.callbackLocked = false;
        emit CallbackAttempted(requestId, succeeded);
    }
}
