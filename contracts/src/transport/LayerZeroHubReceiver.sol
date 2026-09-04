// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ILayerZeroEndpointV2, ILayerZeroReceiverV2, Origin } from "./LayerZeroTypes.sol";

contract LayerZeroHubReceiver is ILayerZeroReceiverV2 {
    struct PendingMessage {
        uint32 sourceChainId;
        address sourceSender;
        address targetGenLayerContract;
        bytes data;
        bool relayed;
    }

    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    mapping(uint32 => bytes32) public trustedSenders;
    mapping(bytes32 => PendingMessage) private messages;
    mapping(bytes32 => bool) public processedGuids;
    mapping(address => bool) public authorizedRelayers;

    error Unauthorized();
    error InvalidAddress();
    error DuplicateMessage();

    event MessageReceived(
        bytes32 indexed messageId,
        uint32 indexed sourceChainId,
        address indexed sourceSender,
        address targetGenLayerContract
    );
    event MessageRelayed(bytes32 indexed messageId, address indexed relayer);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor(address endpoint_, address owner_) {
        if (endpoint_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setTrustedSender(uint32 eid, bytes32 sender) external onlyOwner {
        if (sender == bytes32(0)) revert InvalidAddress();
        trustedSenders[eid] = sender;
    }

    function setRelayer(address relayer, bool authorized) external onlyOwner {
        if (relayer == address(0)) revert InvalidAddress();
        authorizedRelayers[relayer] = authorized;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        return trustedSenders[origin.srcEid] == origin.sender;
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address,
        bytes calldata
    ) external payable {
        if (msg.sender != address(endpoint) || trustedSenders[origin.srcEid] != origin.sender) {
            revert Unauthorized();
        }
        if (processedGuids[guid]) revert DuplicateMessage();
        processedGuids[guid] = true;

        (
            uint32 sourceChainId,
            address sourceSender,
            address targetGenLayerContract,
            bytes memory data,
            bytes32 messageId
        ) = abi.decode(message, (uint32, address, address, bytes, bytes32));
        if (messageId == bytes32(0) || messages[messageId].sourceSender != address(0)) {
            revert DuplicateMessage();
        }
        messages[messageId] =
            PendingMessage(sourceChainId, sourceSender, targetGenLayerContract, data, false);
        emit MessageReceived(messageId, sourceChainId, sourceSender, targetGenLayerContract);
    }

    function markRelayed(bytes32 messageId) external {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        PendingMessage storage pending = messages[messageId];
        if (pending.sourceSender == address(0) || pending.relayed) revert DuplicateMessage();
        pending.relayed = true;
        emit MessageRelayed(messageId, msg.sender);
    }

    function getMessage(bytes32 messageId) external view returns (PendingMessage memory) {
        return messages[messageId];
    }
}
