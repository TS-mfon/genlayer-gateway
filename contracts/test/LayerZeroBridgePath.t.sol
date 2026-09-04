// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "../src/GatewayRouter.sol";
import { IGatewayCallback } from "../src/interfaces/IGatewayCallback.sol";
import { MockLayerZeroEndpoint } from "../src/mocks/MockLayerZeroEndpoint.sol";
import { LayerZeroGatewaySender } from "../src/transport/LayerZeroGatewaySender.sol";
import { LayerZeroHubReceiver } from "../src/transport/LayerZeroHubReceiver.sol";
import { LayerZeroHubForwarder } from "../src/transport/LayerZeroHubForwarder.sol";
import { LayerZeroResultReceiver } from "../src/transport/LayerZeroResultReceiver.sol";
import { MessagingParams } from "../src/transport/LayerZeroTypes.sol";

interface VmBridge {
    function chainId(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert(bytes4) external;
    function expectRevert() external;
}

contract BridgeCallback is IGatewayCallback {
    uint256 public calls;
    uint8 public decision;

    function onGatewayResult(bytes32, uint8 decision_, bytes32, bytes32) external {
        calls++;
        decision = decision_;
    }
}

contract LayerZeroBridgePathTest {
    VmBridge private constant vm =
        VmBridge(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint32 private constant BASE_EID = 40_245;
    uint32 private constant HUB_EID = 40_300;
    uint32 private constant GENLAYER_CHAIN_ID = 4_221;
    address private constant GENLAYER_GATEWAY = address(0x7777);

    MockLayerZeroEndpoint private endpoint;
    LayerZeroGatewaySender private sender;
    LayerZeroHubReceiver private hubReceiver;
    LayerZeroHubForwarder private hubForwarder;
    LayerZeroResultReceiver private resultReceiver;
    GatewayRouter private router;
    BridgeCallback private callback;

    receive() external payable { }

    function setUp() public {
        vm.chainId(84_532);
        endpoint = new MockLayerZeroEndpoint(BASE_EID, 0.0001 ether);
        hubReceiver = new LayerZeroHubReceiver(address(endpoint), address(this));
        sender = new LayerZeroGatewaySender(
            address(endpoint),
            address(this),
            HUB_EID,
            _addressToBytes32(address(hubReceiver)),
            GENLAYER_GATEWAY
        );
        router = new GatewayRouter(address(this), address(sender));
        sender.setRouter(address(router));

        resultReceiver =
            new LayerZeroResultReceiver(address(endpoint), address(this), GENLAYER_CHAIN_ID);
        resultReceiver.setRouter(address(router));
        resultReceiver.setTrustedGenLayerSender(GENLAYER_GATEWAY);
        router.setResultReceiver(address(resultReceiver));

        hubForwarder = new LayerZeroHubForwarder(address(endpoint), address(this));
        hubForwarder.setRelayer(address(this), true);
        hubForwarder.setDestination(BASE_EID, _addressToBytes32(address(resultReceiver)));
        hubForwarder.setTrustedGenLayerSender(GENLAYER_GATEWAY);
        hubForwarder.setTrustedOriginRouter(address(router));
        hubForwarder.setHubReceiver(address(hubReceiver));
        hubForwarder.setResultAttestor(vm.addr(0xA11CE));
        hubReceiver.setTrustedSender(BASE_EID, _addressToBytes32(address(sender)));
        hubReceiver.setRelayer(address(this), true);
        resultReceiver.setTrustedForwarder(HUB_EID, _addressToBytes32(address(hubForwarder)));
        callback = new BridgeCallback();
    }

    function testRoundTripFinalizesAuthenticatedResult() public {
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 policyHash = keccak256("policy");
        (bytes32 requestId, bytes32 messageId) = router.requestDecision{ value: 0.001 ether }(
            "question",
            "policy",
            "https://evidence.example/1",
            evidenceHash,
            address(callback),
            1,
            uint64(block.timestamp + 1 days)
        );

        MessagingParams memory outbound = endpoint.getLastMessage();
        endpoint.deliver(
            address(hubReceiver),
            BASE_EID,
            _addressToBytes32(address(sender)),
            endpoint.lastGuid(),
            outbound.message
        );
        LayerZeroHubReceiver.PendingMessage memory pending = hubReceiver.getMessage(messageId);
        require(pending.sourceSender == address(router), "hub source");
        require(pending.targetGenLayerContract == GENLAYER_GATEWAY, "hub target");
        hubReceiver.markRelayed(messageId);

        bytes32 resultTxHash = keccak256("genlayer-finalized-transaction");
        bytes memory inner = abi.encode(
            uint8(1),
            requestId,
            uint8(GatewayRouter.Decision.Pass),
            evidenceHash,
            policyHash,
            resultTxHash,
            messageId
        );
        bytes memory resultMessage =
            abi.encode(GENLAYER_CHAIN_ID, GENLAYER_GATEWAY, address(router), inner);
        bytes memory attestation = _attestation(
            resultTxHash, requestId, evidenceHash, policyHash, messageId, resultMessage
        );
        hubForwarder.forwardResult{ value: 0.0001 ether }(
            resultTxHash, BASE_EID, resultMessage, "", attestation
        );
        MessagingParams memory returned = endpoint.getLastMessage();
        endpoint.deliver(
            address(resultReceiver),
            HUB_EID,
            _addressToBytes32(address(hubForwarder)),
            endpoint.lastGuid(),
            returned.message
        );

        (
            ,,,,,,,,,
            GatewayRouter.Decision decision,
            GatewayRouter.Status status,,
            bytes32 storedResultTx
        ) = router.requests(requestId);
        require(decision == GatewayRouter.Decision.Pass, "decision");
        require(status == GatewayRouter.Status.CallbackExecuted, "status");
        require(storedResultTx == resultTxHash, "result tx");
        require(callback.calls() == 1 && callback.decision() == 1, "callback");
    }

    function testUntrustedHubSenderCannotDeliver() public {
        bytes memory message = abi.encode(
            uint32(84_532), address(router), GENLAYER_GATEWAY, bytes("x"), keccak256("id")
        );
        (bool succeeded,) = address(endpoint)
            .call(
                abi.encodeCall(
                    endpoint.deliver,
                    (
                        address(hubReceiver),
                        BASE_EID,
                        bytes32(uint256(123)),
                        keccak256("guid"),
                        message
                    )
                )
            );
        require(!succeeded, "untrusted sender accepted");
    }

    function testUntrustedGenLayerSenderCannotReturn() public {
        bytes memory message =
            abi.encode(GENLAYER_CHAIN_ID, address(0x9999), address(router), bytes("x"));
        (bool succeeded,) = address(endpoint)
            .call(
                abi.encodeCall(
                    endpoint.deliver,
                    (
                        address(resultReceiver),
                        HUB_EID,
                        _addressToBytes32(address(hubForwarder)),
                        keccak256("guid"),
                        message
                    )
                )
            );
        require(!succeeded, "untrusted result accepted");
    }

    function testAttestationCannotBeReusedForAlteredDecision() public {
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 policyHash = keccak256("policy");
        (bytes32 requestId, bytes32 messageId) = router.requestDecision{ value: 0.001 ether }(
            "question",
            "policy",
            "https://evidence.example/2",
            evidenceHash,
            address(callback),
            1,
            uint64(block.timestamp + 1 days)
        );
        MessagingParams memory outbound = endpoint.getLastMessage();
        endpoint.deliver(
            address(hubReceiver),
            BASE_EID,
            _addressToBytes32(address(sender)),
            endpoint.lastGuid(),
            outbound.message
        );
        hubReceiver.markRelayed(messageId);

        bytes32 resultTxHash = keccak256("result");
        bytes memory validInner = abi.encode(
            uint8(1),
            requestId,
            uint8(GatewayRouter.Decision.Pass),
            evidenceHash,
            policyHash,
            resultTxHash,
            messageId
        );
        bytes memory validMessage =
            abi.encode(GENLAYER_CHAIN_ID, GENLAYER_GATEWAY, address(router), validInner);
        bytes memory attestation = _attestation(
            resultTxHash, requestId, evidenceHash, policyHash, messageId, validMessage
        );
        bytes memory alteredInner = abi.encode(
            uint8(1),
            requestId,
            uint8(GatewayRouter.Decision.Fail),
            evidenceHash,
            policyHash,
            resultTxHash,
            messageId
        );
        bytes memory alteredMessage =
            abi.encode(GENLAYER_CHAIN_ID, GENLAYER_GATEWAY, address(router), alteredInner);
        (bool succeeded,) = address(hubForwarder).call{ value: 0.0001 ether }(
            abi.encodeCall(
                hubForwarder.forwardResult,
                (resultTxHash, BASE_EID, alteredMessage, bytes(""), attestation)
            )
        );
        require(!succeeded, "altered decision accepted");
    }

    function testResultReplayKeyMustMatchReturnedPayload() public {
        bytes32 committedResultTxHash = keccak256("committed-result");
        bytes memory inner = abi.encode(
            uint8(1),
            keccak256("request"),
            uint8(GatewayRouter.Decision.Pass),
            keccak256("evidence"),
            keccak256("policy"),
            committedResultTxHash,
            keccak256("origin-message")
        );
        bytes memory resultMessage =
            abi.encode(GENLAYER_CHAIN_ID, GENLAYER_GATEWAY, address(router), inner);

        (bool succeeded,) = address(hubForwarder).call{ value: 0.0001 ether }(
            abi.encodeCall(
                hubForwarder.forwardResult,
                (keccak256("different-result"), BASE_EID, resultMessage, bytes(""), bytes(""))
            )
        );

        require(!succeeded, "mismatched replay key accepted");
        require(!hubForwarder.usedResultTxHashes(committedResultTxHash), "commitment consumed");
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }

    function _attestation(
        bytes32 resultTxHash,
        bytes32 requestId,
        bytes32 evidenceHash,
        bytes32 policyHash,
        bytes32 originMessageId,
        bytes memory resultMessage
    ) private returns (bytes memory) {
        bytes32 digest = hubForwarder.getResultAttestationDigest(
            resultTxHash,
            requestId,
            uint8(GatewayRouter.Decision.Pass),
            evidenceHash,
            policyHash,
            originMessageId,
            BASE_EID,
            keccak256(resultMessage)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xA11CE, digest);
        return abi.encodePacked(r, s, v);
    }
}
