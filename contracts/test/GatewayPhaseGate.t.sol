// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { GatewayRouter } from "../src/GatewayRouter.sol";
import { IGatewayCallback } from "../src/interfaces/IGatewayCallback.sol";
import { MockTransportAdapter } from "../src/mocks/MockTransportAdapter.sol";

interface Vm {
    function chainId(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectPartialRevert(bytes4) external;
}

contract CallbackReceiver is IGatewayCallback {
    bool public shouldRevert;
    uint256 public calls;
    bytes32 public lastRequestId;
    uint8 public lastDecision;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function onGatewayResult(bytes32 requestId, uint8 decision, bytes32, bytes32) external {
        if (shouldRevert) revert("callback failed");
        calls++;
        lastRequestId = requestId;
        lastDecision = decision;
    }
}

contract GatewayPhaseGateTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant CLIENT = address(0xA11CE);
    address private constant WORKER = address(0xB0B);
    address private constant ATTACKER = address(0xBAD);

    MockTransportAdapter private transport;
    GatewayRouter private router;
    AgentEscrow private escrow;
    CallbackReceiver private receiver;

    receive() external payable { }

    function setUp() public {
        vm.chainId(84_532);
        transport = new MockTransportAdapter(0.0001 ether);
        router = new GatewayRouter(address(this), address(transport));
        transport.setRouter(address(router));
        router.setResultReceiver(address(transport));
        escrow = new AgentEscrow(address(router));
        receiver = new CallbackReceiver();
        vm.deal(address(this), 100 ether);
        vm.deal(CLIENT, 100 ether);
        vm.deal(WORKER, 1 ether);
        vm.deal(ATTACKER, 1 ether);
    }

    function _request(address callback, uint64 nonce)
        private
        returns (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash)
    {
        string memory policy = "Tests and deployment must pass.";
        evidenceHash = keccak256("evidence");
        policyHash = keccak256(bytes(policy));
        (requestId,) = router.requestDecision{ value: 0.001 ether }(
            "Was the work completed?",
            policy,
            "https://evidence.example/jobs/1",
            evidenceHash,
            callback,
            nonce,
            uint64(block.timestamp + 1 days)
        );
    }

    function _createEscrowJob() private returns (uint256 jobId, bytes32 policyHash) {
        policyHash = keccak256("Tests and deployment must pass.");
        vm.prank(CLIENT);
        jobId = escrow.createJob{ value: 2 ether }(
            WORKER, uint64(block.timestamp + 2 days), policyHash
        );
    }

    function test01_RequestDispatchesAndStoresCommitments() public {
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        (
            ,,,,,,
            bytes32 storedPolicy,
            bytes32 storedEvidence,,
            GatewayRouter.Decision decision,
            GatewayRouter.Status status,,
        ) = router.requests(requestId);
        require(storedPolicy == policyHash && storedEvidence == evidenceHash, "commitment");
        require(status == GatewayRouter.Status.Dispatched, "status");
        require(decision == GatewayRouter.Decision.None, "decision");
    }

    function test02_UnderpaymentReverts() public {
        vm.expectPartialRevert(GatewayRouter.InvalidFee.selector);
        router.requestDecision{ value: 0.0009 ether }(
            "q", "p", "https://e", keccak256("e"), address(receiver), 1, uint64(block.timestamp + 1)
        );
    }

    function test03_OverpaymentReverts() public {
        vm.expectPartialRevert(GatewayRouter.InvalidFee.selector);
        router.requestDecision{ value: 0.0011 ether }(
            "q", "p", "https://e", keccak256("e"), address(receiver), 1, uint64(block.timestamp + 1)
        );
    }

    function test04_ExpiredRequestReverts() public {
        vm.expectRevert(GatewayRouter.InvalidExpiry.selector);
        router.requestDecision{ value: 0.001 ether }(
            "q", "p", "https://e", keccak256("e"), address(receiver), 1, uint64(block.timestamp)
        );
    }

    function test05_NonceReplayReverts() public {
        _request(address(receiver), 1);
        vm.expectPartialRevert(GatewayRouter.DuplicateRequest.selector);
        _request(address(receiver), 1);
    }

    function test06_UnauthorizedResultReverts() public {
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        vm.prank(ATTACKER);
        vm.expectPartialRevert(GatewayRouter.Unauthorized.selector);
        router.handleResult(requestId, 1, evidenceHash, policyHash, keccak256("forged"));
    }

    function test07_WrongEvidenceCommitmentReverts() public {
        (bytes32 requestId,, bytes32 policyHash) = _request(address(receiver), 1);
        vm.expectRevert(GatewayRouter.CommitmentMismatch.selector);
        transport.deliverResult(requestId, 1, keccak256("wrong"), policyHash);
    }

    function test08_WrongPolicyCommitmentReverts() public {
        (bytes32 requestId, bytes32 evidenceHash,) = _request(address(receiver), 1);
        vm.expectRevert(GatewayRouter.CommitmentMismatch.selector);
        transport.deliverResult(requestId, 1, evidenceHash, keccak256("wrong"));
    }

    function test09_InvalidDecisionReverts() public {
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        vm.expectPartialRevert(GatewayRouter.InvalidDecision.selector);
        transport.deliverResult(requestId, 9, evidenceHash, policyHash);
    }

    function test10_CallbackExecutesOnce() public {
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
        require(receiver.calls() == 1, "callback count");
        require(receiver.lastRequestId() == requestId, "request id");
    }

    function test11_ResultReplayReverts() public {
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
        vm.expectPartialRevert(GatewayRouter.InvalidRequestState.selector);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
    }

    function test12_FailedCallbackCanRetry() public {
        receiver.setShouldRevert(true);
        (bytes32 requestId, bytes32 evidenceHash, bytes32 policyHash) =
            _request(address(receiver), 1);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
        receiver.setShouldRevert(false);
        require(router.retryCallback(requestId), "retry");
        require(receiver.calls() == 1, "callback count");
    }

    function test13_OnlyOwnerUpdatesTransport() public {
        vm.prank(ATTACKER);
        vm.expectPartialRevert(GatewayRouter.Unauthorized.selector);
        router.setTransport(address(0x1234));
    }

    function test14_FeesAccrueAfterDeliveryQuote() public {
        _request(address(receiver), 1);
        require(router.accruedFees() == 0.0009 ether, "accrued fee");
    }

    function test15_InvalidWorkerCannotCreateJob() public {
        vm.prank(CLIENT);
        vm.expectRevert(AgentEscrow.InvalidAddress.selector);
        escrow.createJob{ value: 1 ether }(CLIENT, uint64(block.timestamp + 1 days), keccak256("p"));
    }

    function test16_OnlyWorkerSubmitsEvidence() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.prank(ATTACKER);
        vm.expectPartialRevert(AgentEscrow.Unauthorized.selector);
        escrow.submitEvidence(jobId, "https://evidence.example/jobs/1", keccak256("evidence"));
    }

    function test17_PassReleasesBounty() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.prank(WORKER);
        escrow.submitEvidence(jobId, "https://evidence.example/jobs/1", keccak256("evidence"));
        uint256 beforeBalance = WORKER.balance;
        vm.prank(CLIENT);
        bytes32 requestId = escrow.requestVerification{ value: 0.001 ether }(
            jobId,
            "Was work completed?",
            "Tests and deployment must pass.",
            uint64(block.timestamp + 1 days)
        );
        (,,,,,, bytes32 policyHash, bytes32 evidenceHash,,,,,) = router.requests(requestId);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
        require(WORKER.balance == beforeBalance + 2 ether, "worker payment");
    }

    function test18_FailRefundsClient() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.prank(WORKER);
        escrow.submitEvidence(jobId, "https://evidence.example/jobs/1", keccak256("evidence"));
        vm.prank(CLIENT);
        bytes32 requestId = escrow.requestVerification{ value: 0.001 ether }(
            jobId,
            "Was work completed?",
            "Tests and deployment must pass.",
            uint64(block.timestamp + 1 days)
        );
        uint256 beforeBalance = CLIENT.balance;
        (,,,,,, bytes32 policyHash, bytes32 evidenceHash,,,,,) = router.requests(requestId);
        transport.deliverResult(requestId, 2, evidenceHash, policyHash);
        require(CLIENT.balance == beforeBalance + 2 ether, "client refund");
    }

    function test19_UndeterminedDoesNotReleaseFunds() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.prank(WORKER);
        escrow.submitEvidence(jobId, "https://evidence.example/jobs/1", keccak256("evidence"));
        vm.prank(CLIENT);
        bytes32 requestId = escrow.requestVerification{ value: 0.001 ether }(
            jobId,
            "Was work completed?",
            "Tests and deployment must pass.",
            uint64(block.timestamp + 1 days)
        );
        (,,,,,, bytes32 policyHash, bytes32 evidenceHash,,,,,) = router.requests(requestId);
        transport.deliverResult(requestId, 3, evidenceHash, policyHash);
        (,,,, AgentEscrow.JobStatus status,,,,) = escrow.jobs(jobId);
        require(status == AgentEscrow.JobStatus.Undetermined, "status");
        require(address(escrow).balance == 2 ether, "funds moved");
    }

    function test19b_UndeterminedCannotRefundBeforeDeadline() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.prank(WORKER);
        escrow.submitEvidence(jobId, "https://evidence.example/jobs/1", keccak256("evidence"));
        vm.prank(CLIENT);
        bytes32 requestId = escrow.requestVerification{ value: 0.001 ether }(
            jobId,
            "Was work completed?",
            "Tests and deployment must pass.",
            uint64(block.timestamp + 1 days)
        );
        (,,,,,, bytes32 policyHash, bytes32 evidenceHash,,,,,) = router.requests(requestId);
        transport.deliverResult(requestId, 3, evidenceHash, policyHash);
        vm.prank(CLIENT);
        vm.expectRevert(AgentEscrow.RefundNotYetAvailable.selector);
        escrow.refundTimedOut(jobId);
    }

    function test20_TimeoutRequiresDeadlineAndRefund() public {
        (uint256 jobId,) = _createEscrowJob();
        vm.warp(block.timestamp + 3 days);
        vm.prank(CLIENT);
        escrow.markTimedOut(jobId);
        uint256 beforeBalance = CLIENT.balance;
        vm.prank(CLIENT);
        escrow.refundTimedOut(jobId);
        require(CLIENT.balance == beforeBalance + 2 ether, "timeout refund");
    }

    function test21_LateResultCannotSettleExpiredRequest() public {
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 policyHash = keccak256("policy");
        uint64 expiry = uint64(block.timestamp + 1 hours);
        (bytes32 requestId,) = router.requestDecision{ value: 0.001 ether }(
            "question", "policy", "https://evidence", evidenceHash, address(this), 1, expiry
        );

        vm.warp(uint256(expiry) + 1);
        vm.expectPartialRevert(GatewayRouter.InvalidExpiry.selector);
        transport.deliverResult(requestId, 1, evidenceHash, policyHash);
        require(
            router.getRequestStatus(requestId) == GatewayRouter.Status.Dispatched,
            "late result finalized"
        );
    }
}
