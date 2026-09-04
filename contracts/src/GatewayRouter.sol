// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IGatewayCallback } from "./interfaces/IGatewayCallback.sol";
import { ITransportAdapter } from "./interfaces/ITransportAdapter.sol";

contract GatewayRouter {
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 public constant REQUEST_FEE = 0.001 ether;
    uint256 public constant MAX_QUESTION_BYTES = 4_096;
    uint256 public constant MAX_POLICY_BYTES = 8_192;
    uint256 public constant MAX_EVIDENCE_URI_BYTES = 1_024;
    uint8 public constant PROTOCOL_VERSION = 1;
    uint256 public constant CALLBACK_GAS_LIMIT = 300_000;

    enum Decision {
        None,
        Pass,
        Fail,
        Undetermined
    }

    enum Status {
        None,
        Dispatched,
        Finalized,
        CallbackPending,
        CallbackExecuted
    }

    struct Request {
        address requester;
        address originContract;
        address callback;
        uint64 nonce;
        uint64 expiry;
        bytes32 questionHash;
        bytes32 policyHash;
        bytes32 evidenceHash;
        bytes32 outboundMessageId;
        Decision decision;
        Status status;
        bool callbackLocked;
        bytes32 resultTxHash;
    }

    struct RequestInput {
        string question;
        string policy;
        string evidenceUri;
        bytes32 evidenceHash;
        address callback;
        uint64 nonce;
        uint64 expiry;
    }

    error TestnetOnly(uint256 chainId);
    error Unauthorized(address caller);
    error InvalidAddress();
    error InvalidFee(uint256 paid, uint256 required);
    error InvalidExpiry();
    error InvalidSize();
    error DuplicateRequest(bytes32 requestId);
    error UnknownRequest(bytes32 requestId);
    error InvalidRequestState(bytes32 requestId, Status status);
    error CommitmentMismatch();
    error InvalidDecision(uint8 decision);
    error CallbackReentrancy();
    error NothingToWithdraw();
    error TransferFailed();
    error ProtocolPaused();

    event RequestDispatched(
        bytes32 indexed requestId,
        bytes32 indexed messageId,
        address indexed requester,
        address originContract,
        address callback,
        bytes32 questionHash,
        bytes32 policyHash,
        bytes32 evidenceHash
    );
    event ResultFinalized(
        bytes32 indexed requestId, Decision decision, bytes32 evidenceHash, bytes32 policyHash
    );
    event CallbackAttempted(bytes32 indexed requestId, bool succeeded);
    event TransportUpdated(address indexed oldTransport, address indexed newTransport);
    event ResultReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event PauseUpdated(bool paused);

    address public owner;
    ITransportAdapter public transport;
    address public resultReceiver;
    uint256 public accruedFees;
    bool public paused;

    mapping(bytes32 requestId => Request request) public requests;
    mapping(address application => uint64 nonce) public latestNonce;

    constructor(address initialOwner, address initialTransport) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert TestnetOnly(block.chainid);
        if (initialOwner == address(0) || initialTransport == address(0)) revert InvalidAddress();
        owner = initialOwner;
        transport = ITransportAdapter(initialTransport);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyResultReceiver() {
        if (msg.sender != resultReceiver) revert Unauthorized(msg.sender);
        _;
    }

    function requestDecision(
        string calldata question,
        string calldata policy,
        string calldata evidenceUri,
        bytes32 evidenceHash,
        address callback,
        uint64 nonce,
        uint64 expiry
    ) external payable returns (bytes32 requestId, bytes32 messageId) {
        RequestInput memory input = RequestInput(
            question, policy, evidenceUri, evidenceHash, callback, nonce, expiry
        );
        return _requestDecision(input);
    }

    function _requestDecision(RequestInput memory input)
        internal
        returns (bytes32 requestId, bytes32 messageId)
    {
        _validateRequest(
            input.question,
            input.policy,
            input.evidenceUri,
            input.evidenceHash,
            input.callback,
            input.nonce,
            input.expiry
        );
        bytes32 questionHash = keccak256(bytes(input.question));
        bytes32 policyHash = keccak256(bytes(input.policy));
        requestId = _computeRequestId(
            msg.sender,
            input.callback,
            input.nonce,
            input.expiry,
            questionHash,
            policyHash,
            input.evidenceHash
        );
        if (requests[requestId].status != Status.None) revert DuplicateRequest(requestId);

        bytes memory payload = _encodeRequestPayload(requestId, input);
        uint256 deliveryFee = transport.quoteDispatch(payload);
        if (deliveryFee > msg.value) revert InvalidFee(msg.value, deliveryFee);

        latestNonce[msg.sender] = input.nonce;
        _storeRequest(
            requestId,
            input.callback,
            input.nonce,
            input.expiry,
            questionHash,
            policyHash,
            input.evidenceHash
        );
        messageId = transport.dispatch{ value: deliveryFee }(payload);
        requests[requestId].outboundMessageId = messageId;
        accruedFees += msg.value - deliveryFee;

        _emitRequestDispatched(
            requestId, messageId, input.callback, questionHash, policyHash, input.evidenceHash
        );
    }

    function _validateRequest(
        string memory question,
        string memory policy,
        string memory evidenceUri,
        bytes32 evidenceHash,
        address callback,
        uint64 nonce,
        uint64 expiry
    ) internal view {
        if (paused) revert ProtocolPaused();
        if (msg.value != REQUEST_FEE) revert InvalidFee(msg.value, REQUEST_FEE);
        if (callback == address(0) || evidenceHash == bytes32(0)) revert InvalidAddress();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (
            bytes(question).length == 0 || bytes(question).length > MAX_QUESTION_BYTES
                || bytes(policy).length == 0 || bytes(policy).length > MAX_POLICY_BYTES
                || bytes(evidenceUri).length == 0
                || bytes(evidenceUri).length > MAX_EVIDENCE_URI_BYTES
        ) revert InvalidSize();
        if (nonce <= latestNonce[msg.sender]) revert DuplicateRequest(bytes32(uint256(nonce)));
    }

    function _encodeRequestPayload(bytes32 requestId, RequestInput memory input)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            PROTOCOL_VERSION,
            requestId,
            block.chainid,
            address(this),
            msg.sender,
            input.callback,
            input.nonce,
            input.expiry,
            input.question,
            input.policy,
            input.evidenceUri,
            input.evidenceHash
        );
    }

    function _emitRequestDispatched(
        bytes32 requestId,
        bytes32 messageId,
        address callback,
        bytes32 questionHash,
        bytes32 policyHash,
        bytes32 evidenceHash
    ) internal {
        emit RequestDispatched(
            requestId,
            messageId,
            msg.sender,
            msg.sender,
            callback,
            questionHash,
            policyHash,
            evidenceHash
        );
    }

    function _computeRequestId(
        address requester,
        address callback,
        uint64 nonce,
        uint64 expiry,
        bytes32 questionHash,
        bytes32 policyHash,
        bytes32 evidenceHash
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                PROTOCOL_VERSION,
                block.chainid,
                address(this),
                requester,
                callback,
                nonce,
                expiry,
                questionHash,
                policyHash,
                evidenceHash
            )
        );
    }

    function _storeRequest(
        bytes32 requestId,
        address callback,
        uint64 nonce,
        uint64 expiry,
        bytes32 questionHash,
        bytes32 policyHash,
        bytes32 evidenceHash
    ) internal {
        Request storage request = requests[requestId];
        request.requester = msg.sender;
        request.originContract = msg.sender;
        request.callback = callback;
        request.nonce = nonce;
        request.expiry = expiry;
        request.questionHash = questionHash;
        request.policyHash = policyHash;
        request.evidenceHash = evidenceHash;
        request.status = Status.Dispatched;
    }

    function handleResult(
        bytes32 requestId,
        uint8 rawDecision,
        bytes32 evidenceHash,
        bytes32 policyHash,
        bytes32 resultTxHash
    ) external onlyResultReceiver {
        Request storage request = requests[requestId];
        if (request.status == Status.None) revert UnknownRequest(requestId);
        if (request.status != Status.Dispatched) {
            revert InvalidRequestState(requestId, request.status);
        }
        if (block.timestamp > request.expiry) revert InvalidExpiry();
        if (request.evidenceHash != evidenceHash || request.policyHash != policyHash) {
            revert CommitmentMismatch();
        }
        if (rawDecision < uint8(Decision.Pass) || rawDecision > uint8(Decision.Undetermined)) {
            revert InvalidDecision(rawDecision);
        }
        if (resultTxHash == bytes32(0)) revert InvalidAddress();

        request.decision = Decision(rawDecision);
        request.resultTxHash = resultTxHash;
        request.status = Status.Finalized;
        emit ResultFinalized(requestId, request.decision, evidenceHash, policyHash);
        _attemptCallback(requestId, request);
    }

    function retryCallback(bytes32 requestId) external returns (bool succeeded) {
        Request storage request = requests[requestId];
        if (request.status != Status.CallbackPending) {
            revert InvalidRequestState(requestId, request.status);
        }
        succeeded = _attemptCallback(requestId, request);
    }

    function setTransport(address newTransport) external onlyOwner {
        if (newTransport == address(0)) revert InvalidAddress();
        address oldTransport = address(transport);
        transport = ITransportAdapter(newTransport);
        emit TransportUpdated(oldTransport, newTransport);
    }

    function setResultReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert InvalidAddress();
        address oldReceiver = resultReceiver;
        resultReceiver = newReceiver;
        emit ResultReceiverUpdated(oldReceiver, newReceiver);
    }

    function getRequestStatus(bytes32 requestId) external view returns (Status) {
        return requests[requestId].status;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PauseUpdated(newPaused);
    }

    function withdrawFees(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;
        (bool sent,) = recipient.call{ value: amount }("");
        if (!sent) revert TransferFailed();
    }

    function _attemptCallback(bytes32 requestId, Request storage request)
        internal
        returns (bool succeeded)
    {
        if (request.callbackLocked) revert CallbackReentrancy();
        request.callbackLocked = true;
        request.status = Status.CallbackPending;

        bytes memory callbackData = abi.encodeCall(
            IGatewayCallback.onGatewayResult,
            (requestId, uint8(request.decision), request.evidenceHash, request.policyHash)
        );
        address callbackAddress = request.callback;
        (succeeded,) = callbackAddress.call{ gas: CALLBACK_GAS_LIMIT }(callbackData);
        if (succeeded) {
            request.status = Status.CallbackExecuted;
        }

        request.callbackLocked = false;
        emit CallbackAttempted(requestId, succeeded);
    }
}
