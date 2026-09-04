// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ILayerZeroEndpointV2, MessagingFee, MessagingParams } from "./LayerZeroTypes.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IQuorumHubMessageStore {
    struct PendingMessage {
        uint32 sourceChainId;
        address sourceSender;
        address targetGenLayerContract;
        bytes data;
        bool relayed;
    }

    function getMessage(bytes32 messageId) external view returns (PendingMessage memory);
}

contract LayerZeroHubForwarderQuorum {
    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "GatewayResult(bytes32 resultTxHash,bytes32 requestId,uint8 decision,bytes32 evidenceHash,bytes32 policyHash,bytes32 originMessageId,uint32 destinationEid,bytes32 messageHash,uint64 signerEpoch,uint256 hubChainId,address forwarder)"
    );

    uint32 public constant GENLAYER_CHAIN_ID = 4_221;
    uint32 public constant BASE_CHAIN_ID = 84_532;
    uint8 public constant PROTOCOL_VERSION = 1;

    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    mapping(address => bool) public authorizedRelayers;
    mapping(uint32 => bytes32) public destinationReceivers;
    mapping(bytes32 => bool) public usedResultTxHashes;
    mapping(address => bool) public authorizedSigners;
    address[] private signerList;
    address public trustedGenLayerSender;
    address public trustedOriginRouter;
    IQuorumHubMessageStore public hubReceiver;
    uint64 public signerEpoch = 1;
    uint8 public quorum;

    error Unauthorized();
    error InvalidAddress();
    error InvalidQuorum();
    error DuplicateResult();
    error InvalidFee();
    error InvalidSource();
    error CommitmentMismatch();
    error InvalidSignature();
    error DuplicateSigner();
    error InvalidInboundMessage(uint8 reason);

    event ResultForwarded(
        bytes32 indexed resultTxHash, bytes32 indexed endpointGuid, uint32 indexed destinationEid
    );
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event TrustedGenLayerSenderUpdated(address indexed sender);
    event TrustedOriginRouterUpdated(address indexed router);
    event HubReceiverUpdated(address indexed receiver);
    event SignerUpdated(address indexed signer, bool authorized, uint64 indexed signerEpoch);
    event QuorumUpdated(uint8 quorum, uint64 indexed signerEpoch);

    constructor(address endpoint_, address owner_, address[] memory signers_, uint8 quorum_) {
        if (endpoint_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
        _setSigners(signers_, quorum_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function signerCount() external view returns (uint256) {
        return signerList.length;
    }

    function signerAt(uint256 index) external view returns (address) {
        return signerList[index];
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

    function setTrustedOriginRouter(address router) external onlyOwner {
        if (router == address(0)) revert InvalidAddress();
        trustedOriginRouter = router;
        emit TrustedOriginRouterUpdated(router);
    }

    function setHubReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert InvalidAddress();
        hubReceiver = IQuorumHubMessageStore(receiver);
        emit HubReceiverUpdated(receiver);
    }

    function setSigner(address signer, bool authorized) external onlyOwner {
        if (signer == address(0)) revert InvalidAddress();
        if (authorized == authorizedSigners[signer]) return;
        if (authorized) {
            authorizedSigners[signer] = true;
            signerList.push(signer);
        } else {
            authorizedSigners[signer] = false;
            for (uint256 index; index < signerList.length; index++) {
                if (signerList[index] == signer) {
                    signerList[index] = signerList[signerList.length - 1];
                    signerList.pop();
                    break;
                }
            }
        }
        if (quorum < 2 || quorum > signerList.length) revert InvalidQuorum();
        signerEpoch++;
        emit SignerUpdated(signer, authorized, signerEpoch);
    }

    function setQuorum(uint8 newQuorum) external onlyOwner {
        if (newQuorum == 0 || newQuorum > signerList.length) revert InvalidQuorum();
        quorum = newQuorum;
        signerEpoch++;
        emit QuorumUpdated(newQuorum, signerEpoch);
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
        bytes[] calldata attestations
    ) external payable returns (bytes32 endpointGuid) {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        if (resultTxHash == bytes32(0) || usedResultTxHashes[resultTxHash]) {
            revert DuplicateResult();
        }
        (uint32 sourceChainId, address sourceSender, address localContract, bytes memory data) =
            abi.decode(message, (uint32, address, address, bytes));
        if (
            sourceChainId != GENLAYER_CHAIN_ID || sourceSender != trustedGenLayerSender
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
            version != PROTOCOL_VERSION || trustedOriginRouter == address(0)
                || localContract != trustedOriginRouter || originMessageId == bytes32(0)
                || address(hubReceiver) == address(0)
        ) revert InvalidInboundMessage(1);
        IQuorumHubMessageStore.PendingMessage memory pending =
            hubReceiver.getMessage(originMessageId);
        bytes memory inboundData = pending.data;
        if (inboundData.length < 64) revert InvalidInboundMessage(2);
        if (!pending.relayed || pending.targetGenLayerContract != trustedGenLayerSender) {
            revert InvalidInboundMessage(4);
        }
        bytes32 inboundRequestId;
        assembly ("memory-safe") {
            inboundRequestId := mload(add(inboundData, 64))
        }
        if (
            pending.sourceChainId != BASE_CHAIN_ID || pending.sourceSender != trustedOriginRouter
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
        _verifyQuorum(digest, attestations);

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

    function _setSigners(address[] memory signers_, uint8 quorum_) internal {
        if (signers_.length == 0 || quorum_ < 2 || quorum_ > signers_.length) {
            revert InvalidQuorum();
        }
        for (uint256 index; index < signers_.length; index++) {
            address signer = signers_[index];
            if (signer == address(0) || authorizedSigners[signer]) revert InvalidAddress();
            authorizedSigners[signer] = true;
            signerList.push(signer);
        }
        quorum = quorum_;
    }

    function _verifyQuorum(bytes32 digest, bytes[] calldata attestations) internal view {
        if (attestations.length < quorum) revert InvalidSignature();
        address[] memory recoveredSigners = new address[](attestations.length);
        for (uint256 index; index < attestations.length; index++) {
            (address recovered, ECDSA.RecoverError recoverError,) =
                ECDSA.tryRecover(digest, attestations[index]);
            if (recoverError != ECDSA.RecoverError.NoError || !authorizedSigners[recovered]) {
                revert InvalidSignature();
            }
            for (uint256 previous; previous < index; previous++) {
                if (recoveredSigners[previous] == recovered) revert DuplicateSigner();
            }
            recoveredSigners[index] = recovered;
        }
    }
}
