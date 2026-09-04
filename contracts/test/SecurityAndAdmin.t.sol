// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { GatewayRouter } from "../src/GatewayRouter.sol";
import { MockLayerZeroEndpoint } from "../src/mocks/MockLayerZeroEndpoint.sol";
import { MockTransportAdapter } from "../src/mocks/MockTransportAdapter.sol";
import { LayerZeroGatewaySender } from "../src/transport/LayerZeroGatewaySender.sol";
import { LayerZeroHubForwarder } from "../src/transport/LayerZeroHubForwarder.sol";
import { LayerZeroHubReceiver } from "../src/transport/LayerZeroHubReceiver.sol";
import { LayerZeroResultReceiver } from "../src/transport/LayerZeroResultReceiver.sol";

interface VmSecurity {
    function chainId(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function assume(bool) external;
    function expectRevert(bytes4) external;
    function expectPartialRevert(bytes4) external;
}

contract RejectingWorker {
    function submit(AgentEscrow escrow, uint256 jobId, string calldata uri, bytes32 digest)
        external
    {
        escrow.submitEvidence(jobId, uri, digest);
    }

    receive() external payable {
        revert("reject payment");
    }
}

contract SecurityAndAdminTest {
    VmSecurity private constant vm =
        VmSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant CLIENT = address(0xA11CE);
    address private constant ATTACKER = address(0xBAD);
    address private constant NEW_OWNER = address(0xBEEF);

    MockTransportAdapter private transport;
    GatewayRouter private router;
    AgentEscrow private escrow;

    receive() external payable { }

    function setUp() public {
        vm.chainId(84_532);
        transport = new MockTransportAdapter(0.0001 ether);
        router = new GatewayRouter(address(this), address(transport));
        transport.setRouter(address(router));
        router.setResultReceiver(address(transport));
        escrow = new AgentEscrow(address(router));
        vm.deal(address(this), 100 ether);
        vm.deal(CLIENT, 100 ether);
    }

    function testTransportAdminOwnershipCanRotate() public {
        MockLayerZeroEndpoint endpoint = new MockLayerZeroEndpoint(1, 0);
        LayerZeroGatewaySender sender = new LayerZeroGatewaySender(
            address(endpoint), address(this), 2, bytes32(uint256(1)), address(0x1234)
        );
        LayerZeroHubReceiver receiver = new LayerZeroHubReceiver(address(endpoint), address(this));
        LayerZeroHubForwarder forwarder =
            new LayerZeroHubForwarder(address(endpoint), address(this));
        LayerZeroResultReceiver result =
            new LayerZeroResultReceiver(address(endpoint), address(this), 4_221);

        sender.transferOwnership(NEW_OWNER);
        receiver.transferOwnership(NEW_OWNER);
        forwarder.transferOwnership(NEW_OWNER);
        result.transferOwnership(NEW_OWNER);

        vm.expectRevert(LayerZeroGatewaySender.Unauthorized.selector);
        sender.setOptions(hex"01");
        vm.expectRevert(LayerZeroHubReceiver.Unauthorized.selector);
        receiver.setRelayer(address(this), true);
        vm.expectRevert(LayerZeroHubForwarder.Unauthorized.selector);
        forwarder.setRelayer(address(this), true);
        vm.expectRevert(LayerZeroResultReceiver.Unauthorized.selector);
        result.setTrustedGenLayerSender(address(0x2222));

        vm.prank(NEW_OWNER);
        sender.setOptions(hex"01");
        vm.prank(NEW_OWNER);
        receiver.setRelayer(address(this), true);
        vm.prank(NEW_OWNER);
        forwarder.setRelayer(address(this), true);
        vm.prank(NEW_OWNER);
        result.setTrustedGenLayerSender(address(0x2222));
    }

    function testTimeoutCannotOverrideFinalizedPassWithFailedCallback() public {
        RejectingWorker worker = new RejectingWorker();
        bytes32 policyHash = keccak256("policy");
        vm.prank(CLIENT);
        uint256 jobId = escrow.createJob{ value: 1 ether }(
            address(worker), uint64(block.timestamp + 1 days), policyHash
        );
        worker.submit(escrow, jobId, "https://evidence.example/job", keccak256("evidence"));
        vm.prank(CLIENT);
        bytes32 requestId = escrow.requestVerification{ value: 0.001 ether }(
            jobId, "question", "policy", uint64(block.timestamp + 12 hours)
        );
        (,,,,,, bytes32 storedPolicy, bytes32 storedEvidence,,,,,) = router.requests(requestId);
        transport.deliverResult(requestId, 1, storedEvidence, storedPolicy);
        require(
            router.getRequestStatus(requestId) == GatewayRouter.Status.CallbackPending,
            "callback status"
        );

        vm.warp(block.timestamp + 2 days);
        vm.prank(CLIENT);
        vm.expectPartialRevert(AgentEscrow.InvalidJobState.selector);
        escrow.markTimedOut(jobId);
    }

    function testDeliveryQuoteAboveFixedFeeReverts() public {
        transport.setDeliveryFee(0.002 ether);
        vm.expectPartialRevert(GatewayRouter.InvalidFee.selector);
        router.requestDecision{ value: 0.001 ether }(
            "question",
            "policy",
            "https://evidence",
            keccak256("evidence"),
            address(this),
            1,
            uint64(block.timestamp + 1 days)
        );
    }

    function testOversizedQuestionReverts() public {
        bytes memory data = new bytes(router.MAX_QUESTION_BYTES() + 1);
        vm.expectRevert(GatewayRouter.InvalidSize.selector);
        router.requestDecision{ value: 0.001 ether }(
            string(data),
            "policy",
            "https://evidence",
            keccak256("evidence"),
            address(this),
            1,
            uint64(block.timestamp + 1 days)
        );
    }

    function testZeroAddressAdminUpdatesRevert() public {
        vm.expectRevert(GatewayRouter.InvalidAddress.selector);
        router.setResultReceiver(address(0));
        vm.expectRevert(GatewayRouter.InvalidAddress.selector);
        router.transferOwnership(address(0));
    }

    function testFuzz_NonExactRequestFeeAlwaysReverts(uint96 seed) public {
        uint256 fee = uint256(seed) % 0.01 ether;
        vm.assume(fee != router.REQUEST_FEE());
        vm.expectPartialRevert(GatewayRouter.InvalidFee.selector);
        router.requestDecision{ value: fee }(
            "question",
            "policy",
            "https://evidence",
            keccak256("evidence"),
            address(this),
            1,
            uint64(block.timestamp + 1 days)
        );
    }

    function testFuzz_InvalidDecisionAlwaysReverts(uint8 decision) public {
        vm.assume(decision < 1 || decision > 3);
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 policyHash = keccak256("policy");
        (bytes32 requestId,) = router.requestDecision{ value: 0.001 ether }(
            "question",
            "policy",
            "https://evidence",
            evidenceHash,
            address(this),
            1,
            uint64(block.timestamp + 1 days)
        );
        vm.expectPartialRevert(GatewayRouter.InvalidDecision.selector);
        transport.deliverResult(requestId, decision, evidenceHash, policyHash);
    }
}
