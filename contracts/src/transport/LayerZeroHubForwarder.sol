// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ILayerZeroEndpointV2, MessagingFee, MessagingParams } from "./LayerZeroTypes.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IHubMessageStore {
    struct PendingMessage {
        uint32 sourceChainId;
        address sourceSender;
        address targetGenLayerContract;
        bytes data;
        bool relayed;
    }

    function getMessage(bytes32 messageId) external view returns (PendingMessage memory);
}

contract LayerZeroHubForwarder {
    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "GatewayResult(bytes32 resultTxHash,bytes32 requestId,uint8 decision,bytes32 evidenceHash,bytes32 policyHash,bytes32 originMessageId,uint32 destinationEid,bytes32 messageHash,uint64 signerEpoch,uint256 hubChainId,address forwarder)"
    );
    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    mapping(address => bool) public authorizedRelayers;
    mapping(uint32 => bytes32) public destinationReceivers;
    mapping(bytes32 => bool) public usedResultTxHashes;
    address public trustedGenLayerSender;
    address public trustedOriginRouter;
    IHubMessageStore public hubReceiver;
    address public resultAttestor;
    uint64 public signerEpoch = 1;

    error Unauthorized();
    error InvalidAddress();
    error DuplicateResult();
    error InvalidFee();
    error InvalidSource();
    error CommitmentMismatch();
    error InvalidSignature();
    error InvalidInboundMessage(uint8 reason);

    event ResultForwarded(
        bytes32 indexed resultTxHash, bytes32 indexed endpointGuid, uint32 indexed destinationEid
    );
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event TrustedGenLayerSenderUpdated(address indexed sender);
    event ResultAttestorUpdated(address indexed attestor, uint64 indexed signerEpoch);
    event HubReceiverUpdated(address indexed receiver);
    event TrustedOriginRouterUpdated(address indexed router);

    constructor(address endpoint_, address owner_) {
        if (endpoint_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setRelayer(address relayer, bool authorized) external onlyOwner {
        if (relayer == address(0)) revert InvalidAddress();
        authorizedRelayers[relayer] = authorized;
    }

    function setDestination(uint32 eid, bytes32 receiver) external onlyOwner {
        if (receiver == bytes32(0)) revert InvalidAddress();
        destinationReceivers[eid] = receiver;
    }

    function setTrustedGenLayerSender(address sender) external onlyOwner {
        if (sender == address(0)) revert InvalidAddress();
        trustedGenLayerSender = sender;
        emit TrustedGenLayerSenderUpdated(sender);
    }

    function setResultAttestor(address attestor) external onlyOwner {
        if (attestor == address(0)) revert InvalidAddress();
        resultAttestor = attestor;
        signerEpoch++;
        emit ResultAttestorUpdated(attestor, signerEpoch);
    }

    function setTrustedOriginRouter(address router) external onlyOwner {
        if (router == address(0)) revert InvalidAddress();
        trustedOriginRouter = router;
        emit TrustedOriginRouterUpdated(router);
    }

    function setHubReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert InvalidAddress();
        hubReceiver = IHubMessageStore(receiver);
        emit HubReceiverUpdated(receiver);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function quoteResult(uint32 destinationEid, bytes calldata message, bytes calldata options)
        external
        view
        returns (uint256)
    {
        bytes32 receiver = destinationReceivers[destinationEid];
        if (receiver == bytes32(0)) revert InvalidAddress();
        MessagingParams memory params =
            MessagingParams(destinationEid, receiver, message, options, false);
        return endpoint.quote(params, address(this)).nativeFee;
    }

    function forwardResult(
        bytes32 resultTxHash,
        uint32 destinationEid,
        bytes calldata message,
        bytes calldata options,
        bytes calldata attestation
    ) external payable returns (bytes32 endpointGuid) {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        if (resultTxHash == bytes32(0) || usedResultTxHashes[resultTxHash]) {
            revert DuplicateResult();
        }
        (uint32 sourceChainId, address sourceSender, address localContract, bytes memory data) =
            abi.decode(message, (uint32, address, address, bytes));
        if (
            sourceChainId != 4_221 || sourceSender != trustedGenLayerSender
                || localContract == address(0)
        ) revert InvalidSource();
        (
            uint8 version,
            bytes32 requestId,
            uint8 decision,
            bytes32 evidenceHash,
            bytes32 policyHash,
            bytes32 committedResultTxHash,
            bytes32 originMessageId
        ) = abi.decode(data, (uint8, bytes32, uint8, bytes32, bytes32, bytes32, bytes32));
        if (
            version != 1 || trustedOriginRouter == address(0)
                || localContract != trustedOriginRouter || originMessageId == bytes32(0)
                || address(hubReceiver) == address(0)
        ) revert InvalidInboundMessage(1);
        IHubMessageStore.PendingMessage memory pending = hubReceiver.getMessage(originMessageId);
        uint32 inboundSourceChainId = pending.sourceChainId;
        address inboundSourceSender = pending.sourceSender;
        bytes memory inboundData = pending.data;
        if (inboundData.length < 64) revert InvalidInboundMessage(2);
        bytes32 inboundRequestId;
        assembly ("memory-safe") {
            inboundRequestId := mload(add(inboundData, 64))
        }
        if (
            inboundSourceChainId != 84_532 || inboundSourceSender != trustedOriginRouter
                || inboundRequestId != requestId
        ) revert InvalidInboundMessage(3);
        if (committedResultTxHash != resultTxHash) revert CommitmentMismatch();
        bytes32 digest = getResultAttestationDigest(
            resultTxHash,
            requestId,
            decision,
            evidenceHash,
            policyHash,
            originMessageId,
            destinationEid,
            keccak256(message)
        );
        (address recovered, ECDSA.RecoverError recoverError,) =
            ECDSA.tryRecover(digest, attestation);
        if (recoverError != ECDSA.RecoverError.NoError || recovered != resultAttestor) {
            revert InvalidSignature();
        }
        bytes32 receiver = destinationReceivers[destinationEid];
        if (receiver == bytes32(0)) revert InvalidAddress();
        MessagingParams memory params =
            MessagingParams(destinationEid, receiver, message, options, false);
        MessagingFee memory fee = endpoint.quote(params, address(this));
        if (msg.value != fee.nativeFee) revert InvalidFee();
        usedResultTxHashes[resultTxHash] = true;
        endpointGuid = endpoint.send{ value: msg.value }(params, payable(msg.sender)).guid;
        emit ResultForwarded(resultTxHash, endpointGuid, destinationEid);
    }

    function getResultAttestationDigest(
        bytes32 resultTxHash,
        bytes32 requestId,
        uint8 decision,
        bytes32 evidenceHash,
        bytes32 policyHash,
        bytes32 originMessageId,
        uint32 destinationEid,
        bytes32 messageHash
    ) public view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    RESULT_TYPEHASH,
                    resultTxHash,
                    requestId,
                    decision,
                    evidenceHash,
                    policyHash,
                    originMessageId,
                    destinationEid,
                    messageHash,
                    signerEpoch,
                    block.chainid,
                    address(this)
                )
            )
        );
    }
}
