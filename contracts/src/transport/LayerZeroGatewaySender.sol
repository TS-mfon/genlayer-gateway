// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "../GatewayRouter.sol";
import { ITransportAdapter } from "../interfaces/ITransportAdapter.sol";
import { ILayerZeroEndpointV2, MessagingParams, MessagingFee } from "./LayerZeroTypes.sol";

contract LayerZeroGatewaySender is ITransportAdapter {
    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    uint32 public remoteEid;
    bytes32 public remoteReceiver;
    address public targetGenLayerReceiver;
    GatewayRouter public router;
    uint64 public messageNonce;
    bytes public options;

    error Unauthorized();
    error InvalidAddress();
    error InvalidFee();

    event MessageSent(
        bytes32 indexed messageId,
        bytes32 indexed endpointGuid,
        bytes32 indexed requestId,
        uint32 remoteEid
    );
    event RemoteReceiverUpdated(uint32 eid, bytes32 receiver);
    event TargetGenLayerReceiverUpdated(address indexed receiver);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor(
        address endpoint_,
        address owner_,
        uint32 remoteEid_,
        bytes32 remoteReceiver_,
        address target_
    ) {
        if (
            endpoint_ == address(0) || owner_ == address(0) || remoteReceiver_ == bytes32(0)
                || target_ == address(0)
        ) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
        remoteEid = remoteEid_;
        remoteReceiver = remoteReceiver_;
        targetGenLayerReceiver = target_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert InvalidAddress();
        router = GatewayRouter(router_);
    }

    function setRemote(uint32 eid, bytes32 receiver) external onlyOwner {
        if (receiver == bytes32(0)) revert InvalidAddress();
        remoteEid = eid;
        remoteReceiver = receiver;
        emit RemoteReceiverUpdated(eid, receiver);
    }

    function setTargetGenLayerReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert InvalidAddress();
        targetGenLayerReceiver = receiver;
        emit TargetGenLayerReceiverUpdated(receiver);
    }

    function setOptions(bytes calldata newOptions) external onlyOwner {
        options = newOptions;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function quoteDispatch(bytes calldata payload) external view returns (uint256) {
        bytes memory message = abi.encode(
            uint32(block.chainid), address(router), targetGenLayerReceiver, payload, bytes32(0)
        );
        MessagingParams memory params =
            MessagingParams(remoteEid, remoteReceiver, message, options, false);
        return endpoint.quote(params, address(this)).nativeFee;
    }

    function dispatch(bytes calldata payload) external payable returns (bytes32 messageId) {
        if (msg.sender != address(router)) revert Unauthorized();
        if (payload.length < 64) revert InvalidAddress();
        bytes32 requestId;
        assembly {
            requestId := calldataload(add(payload.offset, 32))
        }
        messageId = keccak256(
            abi.encode(block.chainid, address(this), address(router), requestId, ++messageNonce)
        );
        bytes memory message = abi.encode(
            uint32(block.chainid), address(router), targetGenLayerReceiver, payload, messageId
        );
        MessagingParams memory params =
            MessagingParams(remoteEid, remoteReceiver, message, options, false);
        MessagingFee memory fee = endpoint.quote(params, address(this));
        if (msg.value != fee.nativeFee) revert InvalidFee();
        bytes32 endpointGuid = endpoint.send{ value: msg.value }(params, payable(msg.sender)).guid;
        emit MessageSent(messageId, endpointGuid, requestId, remoteEid);
    }
}
