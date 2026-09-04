// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { MockLayerZeroEndpoint } from "../src/mocks/MockLayerZeroEndpoint.sol";
import { LayerZeroHubForwarderQuorum, IQuorumHubMessageStore } from "../src/transport/LayerZeroHubForwarderQuorum.sol";
import { GatewayRouter } from "../src/GatewayRouter.sol";

interface VmQuorum {
    function chainId(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert(bytes4) external;
    function expectPartialRevert(bytes4) external;
}

contract QuorumHubStore is IQuorumHubMessageStore {
    PendingMessage private pending;

    function set(bytes32 messageId, bytes memory data) external {
        messageId;
        pending = PendingMessage(84_532, address(0x5555), address(0x4444), data, true);
    }

    function setRelayed(bool relayed) external {
        pending.relayed = relayed;
    }

    function getMessage(bytes32) external view returns (PendingMessage memory) {
        return pending;
    }
}

contract LayerZeroHubForwarderQuorumTest {
    VmQuorum private constant vm =
        VmQuorum(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SIGNER_ONE = 0xA11CE;
    uint256 private constant SIGNER_TWO = 0xB0B;
    uint256 private constant SIGNER_THREE = 0xC0DE;
    uint32 private constant BASE_EID = 40_245;
    bytes32 private constant ORIGIN_MESSAGE_ID = keccak256("origin-message");
    bytes32 private constant REQUEST_ID = keccak256("request");
    bytes32 private constant EVIDENCE_HASH = keccak256("evidence");
    bytes32 private constant POLICY_HASH = keccak256("policy");
    bytes32 private constant RESULT_TX_HASH = keccak256("result");

    MockLayerZeroEndpoint private endpoint;
    QuorumHubStore private store;
    LayerZeroHubForwarderQuorum private forwarder;
    bytes32 private resultMessageHash;
    bytes[] private validAttestations;

    receive() external payable { }

    function setUp() public {
        vm.chainId(421_614);
        endpoint = new MockLayerZeroEndpoint(40_231, 0.0001 ether);
        store = new QuorumHubStore();
        address[] memory signers = new address[](3);
        signers[0] = vm.addr(SIGNER_ONE);
        signers[1] = vm.addr(SIGNER_TWO);
        signers[2] = vm.addr(SIGNER_THREE);
        forwarder = new LayerZeroHubForwarderQuorum(address(endpoint), address(this), signers, 2);
        forwarder.setRelayer(address(this), true);
        forwarder.setDestination(BASE_EID, bytes32(uint256(uint160(address(0x3333)))));
        forwarder.setTrustedGenLayerSender(address(0x4444));
        forwarder.setTrustedOriginRouter(address(0x5555));
        forwarder.setHubReceiver(address(store));

        bytes memory inbound = abi.encode(
            uint8(1), REQUEST_ID, uint256(84_532), address(0x5555), address(0x6666),
            address(0x7777), uint64(1), uint64(2_000_000_000), "question", "policy",
            "https://evidence.example", EVIDENCE_HASH
        );
        store.set(ORIGIN_MESSAGE_ID, inbound);

        bytes memory inner = abi.encode(
            uint8(1), REQUEST_ID, uint8(GatewayRouter.Decision.Pass), EVIDENCE_HASH,
            POLICY_HASH, RESULT_TX_HASH, ORIGIN_MESSAGE_ID
        );
        bytes memory message = abi.encode(4_221, address(0x4444), address(0x5555), inner);
        resultMessageHash = keccak256(message);
        bytes32 digest = forwarder.getResultAttestationDigest(
            RESULT_TX_HASH, REQUEST_ID, uint8(GatewayRouter.Decision.Pass), EVIDENCE_HASH,
            POLICY_HASH, ORIGIN_MESSAGE_ID, BASE_EID, resultMessageHash
        );
        validAttestations.push(_sign(SIGNER_ONE, digest));
        validAttestations.push(_sign(SIGNER_TWO, digest));
    }

    function testTwoOfThreeAttestationsForwardResult() public {
        bytes32 guid = forwarder.forwardResult{ value: 0.0001 ether }(
            RESULT_TX_HASH, BASE_EID, _message(), "", validAttestations
        );
        require(guid != bytes32(0), "guid");
        require(forwarder.usedResultTxHashes(RESULT_TX_HASH), "result not consumed");
    }

    function testOneAttestationCannotPassQuorum() public {
        bytes[] memory one = new bytes[](1);
        one[0] = validAttestations[0];
        vm.expectRevert(LayerZeroHubForwarderQuorum.InvalidSignature.selector);
        forwarder.forwardResult{ value: 0.0001 ether }(RESULT_TX_HASH, BASE_EID, _message(), "", one);
    }

    function testDuplicateSignerCannotSatisfyQuorum() public {
        bytes[] memory duplicate = new bytes[](2);
        duplicate[0] = validAttestations[0];
        duplicate[1] = validAttestations[0];
        vm.expectRevert(LayerZeroHubForwarderQuorum.DuplicateSigner.selector);
        forwarder.forwardResult{ value: 0.0001 ether }(
            RESULT_TX_HASH, BASE_EID, _message(), "", duplicate
        );
    }

    function testSignerRotationInvalidatesOldAttestations() public {
        forwarder.setSigner(vm.addr(SIGNER_THREE), false);
        vm.expectRevert(LayerZeroHubForwarderQuorum.InvalidSignature.selector);
        forwarder.forwardResult{ value: 0.0001 ether }(
            RESULT_TX_HASH, BASE_EID, _message(), "", validAttestations
        );
    }

    function testUnrelayedInboundCannotReturnResult() public {
        store.setRelayed(false);
        vm.expectPartialRevert(LayerZeroHubForwarderQuorum.InvalidInboundMessage.selector);
        forwarder.forwardResult{ value: 0.0001 ether }(
            RESULT_TX_HASH, BASE_EID, _message(), "", validAttestations
        );
    }

    function _message() private pure returns (bytes memory) {
        bytes memory inner = abi.encode(
            uint8(1), REQUEST_ID, uint8(GatewayRouter.Decision.Pass), EVIDENCE_HASH,
            POLICY_HASH, RESULT_TX_HASH, ORIGIN_MESSAGE_ID
        );
        return abi.encode(4_221, address(0x4444), address(0x5555), inner);
    }

    function _sign(uint256 privateKey, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
