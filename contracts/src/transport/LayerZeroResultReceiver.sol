// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "../GatewayRouter.sol";
import { ILayerZeroEndpointV2, ILayerZeroReceiverV2, Origin } from "./LayerZeroTypes.sol";

contract LayerZeroResultReceiver is ILayerZeroReceiverV2 {
    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    mapping(uint32 => bytes32) public trustedForwarders;
    mapping(bytes32 => bool) public processedGuids;
    GatewayRouter public router;
    uint32 public immutable expectedGenLayerChainId;
    address public trustedGenLayerSender;

    error Unauthorized();
    error InvalidAddress();

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event RouterUpdated(address indexed router);
    event TrustedForwarderUpdated(uint32 indexed eid, bytes32 indexed sender);
    event TrustedGenLayerSenderUpdated(address indexed sender);

    constructor(address endpoint_, address owner_, uint32 expectedGenLayerChainId_) {
        if (endpoint_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
        expectedGenLayerChainId = expectedGenLayerChainId_;
    }

    function setRouter(address router_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (router_ == address(0)) revert InvalidAddress();
        router = GatewayRouter(router_);
        emit RouterUpdated(router_);
    }

    function setTrustedForwarder(uint32 eid, bytes32 sender) external {
        if (msg.sender != owner) revert Unauthorized();
        if (sender == bytes32(0)) revert InvalidAddress();
        trustedForwarders[eid] = sender;
        emit TrustedForwarderUpdated(eid, sender);
    }

    function setTrustedGenLayerSender(address sender) external {
        if (msg.sender != owner) revert Unauthorized();
        if (sender == address(0)) revert InvalidAddress();
        trustedGenLayerSender = sender;
        emit TrustedGenLayerSenderUpdated(sender);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        return trustedForwarders[origin.srcEid] == origin.sender;
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
        if (msg.sender != address(endpoint) || trustedForwarders[origin.srcEid] != origin.sender) revert Unauthorized();
        if (processedGuids[guid]) revert Unauthorized();
        processedGuids[guid] = true;
        (uint32 sourceChainId, address sourceSender, address localContract, bytes memory data) =
            abi.decode(message, (uint32, address, address, bytes));
        if (
            sourceChainId != expectedGenLayerChainId || sourceSender != trustedGenLayerSender
                || localContract != address(router)
        ) revert Unauthorized();
        (
            uint8 version,
            bytes32 requestId,
            uint8 decision,
            bytes32 evidenceHash,
            bytes32 policyHash,
            bytes32 resultTxHash,
            bytes32 originMessageId
        ) = abi.decode(data, (uint8, bytes32, uint8, bytes32, bytes32, bytes32, bytes32));
        if (originMessageId == bytes32(0)) revert Unauthorized();
        if (version != router.PROTOCOL_VERSION()) revert Unauthorized();
        router.handleResult(requestId, decision, evidenceHash, policyHash, resultTxHash);
    }
}
