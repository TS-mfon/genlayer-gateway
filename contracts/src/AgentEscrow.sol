// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "./GatewayRouter.sol";
import { IGatewayCallback } from "./interfaces/IGatewayCallback.sol";

contract AgentEscrow is IGatewayCallback {
    enum JobStatus {
        None,
        Created,
        EvidenceSubmitted,
        VerificationPending,
        Released,
        Refunded,
        Undetermined,
        TimedOut
    }

    struct Job {
        address client;
        address worker;
        uint128 bounty;
        uint64 deadline;
        JobStatus status;
        bytes32 requestId;
        bytes32 policyHash;
        bytes32 evidenceHash;
        string evidenceUri;
    }

    error Unauthorized(address caller);
    error InvalidAddress();
    error InvalidBounty();
    error InvalidDeadline();
    error InvalidJobState(uint256 jobId, JobStatus status);
    error UnknownRequest(bytes32 requestId);
    error CommitmentMismatch();
    error TransferFailed();
    error GatewayPaused();
    error RefundNotYetAvailable();

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed worker,
        uint256 bounty,
        uint64 deadline,
        bytes32 policyHash
    );
    event EvidenceSubmitted(uint256 indexed jobId, bytes32 evidenceHash, string evidenceUri);
    event VerificationRequested(uint256 indexed jobId, bytes32 indexed requestId);
    event JobResolved(uint256 indexed jobId, JobStatus status, uint8 decision);

    GatewayRouter public immutable gateway;
    uint256 public nextJobId = 1;
    uint64 public nextVerificationNonce = 1;
    bool private transferLocked;

    mapping(uint256 jobId => Job job) public jobs;
    mapping(bytes32 requestId => uint256 jobId) public requestToJob;

    constructor(address gatewayRouter) {
        if (gatewayRouter == address(0)) revert InvalidAddress();
        gateway = GatewayRouter(gatewayRouter);
    }

    function createJob(address worker, uint64 deadline, bytes32 policyHash)
        external
        payable
        returns (uint256 jobId)
    {
        if (gateway.paused()) revert GatewayPaused();
        if (worker == address(0) || worker == msg.sender || policyHash == bytes32(0)) {
            revert InvalidAddress();
        }
        if (msg.value == 0 || msg.value > type(uint128).max) revert InvalidBounty();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            worker: worker,
            bounty: uint128(msg.value),
            deadline: deadline,
            status: JobStatus.Created,
            requestId: bytes32(0),
            policyHash: policyHash,
            evidenceHash: bytes32(0),
            evidenceUri: ""
        });
        emit JobCreated(jobId, msg.sender, worker, msg.value, deadline, policyHash);
    }

    function submitEvidence(uint256 jobId, string calldata evidenceUri, bytes32 evidenceHash)
        external
    {
        Job storage job = jobs[jobId];
        if (msg.sender != job.worker) revert Unauthorized(msg.sender);
        if (job.status != JobStatus.Created) revert InvalidJobState(jobId, job.status);
        if (bytes(evidenceUri).length == 0 || evidenceHash == bytes32(0)) revert InvalidAddress();

        job.evidenceUri = evidenceUri;
        job.evidenceHash = evidenceHash;
        job.status = JobStatus.EvidenceSubmitted;
        emit EvidenceSubmitted(jobId, evidenceHash, evidenceUri);
    }

    function requestVerification(
        uint256 jobId,
        string calldata question,
        string calldata policy,
        uint64 expiry
    ) external payable returns (bytes32 requestId) {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client) revert Unauthorized(msg.sender);
        if (job.status != JobStatus.EvidenceSubmitted) revert InvalidJobState(jobId, job.status);
        if (keccak256(bytes(policy)) != job.policyHash) revert CommitmentMismatch();
        if (expiry > job.deadline) revert InvalidDeadline();

        uint64 nonce = nextVerificationNonce++;

        (requestId,) = gateway.requestDecision{ value: msg.value }(
            question, policy, job.evidenceUri, job.evidenceHash, address(this), nonce, expiry
        );
        job.requestId = requestId;
        job.status = JobStatus.VerificationPending;
        requestToJob[requestId] = jobId;
        emit VerificationRequested(jobId, requestId);
    }

    function onGatewayResult(
        bytes32 requestId,
        uint8 decision,
        bytes32 evidenceHash,
        bytes32 policyHash
    ) external override {
        if (msg.sender != address(gateway)) revert Unauthorized(msg.sender);
        uint256 jobId = requestToJob[requestId];
        if (jobId == 0) revert UnknownRequest(requestId);
        Job storage job = jobs[jobId];
        if (job.status != JobStatus.VerificationPending) revert InvalidJobState(jobId, job.status);
        if (job.evidenceHash != evidenceHash || job.policyHash != policyHash) {
            revert CommitmentMismatch();
        }

        if (decision == uint8(GatewayRouter.Decision.Pass)) {
            job.status = JobStatus.Released;
            _pay(job.worker, job.bounty);
        } else if (decision == uint8(GatewayRouter.Decision.Fail)) {
            job.status = JobStatus.Refunded;
            _pay(job.client, job.bounty);
        } else {
            job.status = JobStatus.Undetermined;
        }
        emit JobResolved(jobId, job.status, decision);
    }

    function markTimedOut(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client && msg.sender != job.worker) revert Unauthorized(msg.sender);
        if (block.timestamp <= job.deadline) revert InvalidDeadline();
        if (
            job.status != JobStatus.Created && job.status != JobStatus.EvidenceSubmitted
                && job.status != JobStatus.VerificationPending
        ) revert InvalidJobState(jobId, job.status);
        if (
            job.status == JobStatus.VerificationPending
                && gateway.getRequestStatus(job.requestId) != GatewayRouter.Status.Dispatched
        ) revert InvalidJobState(jobId, job.status);
        job.status = JobStatus.TimedOut;
        emit JobResolved(jobId, JobStatus.TimedOut, 0);
    }

    function refundTimedOut(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client) revert Unauthorized(msg.sender);
        if (job.status != JobStatus.TimedOut && job.status != JobStatus.Undetermined) {
            revert InvalidJobState(jobId, job.status);
        }
        if (job.status == JobStatus.Undetermined && block.timestamp <= job.deadline) {
            revert RefundNotYetAvailable();
        }
        job.status = JobStatus.Refunded;
        _pay(job.client, job.bounty);
        emit JobResolved(jobId, JobStatus.Refunded, uint8(GatewayRouter.Decision.Undetermined));
    }

    function _pay(address recipient, uint256 amount) internal {
        if (transferLocked) revert TransferFailed();
        transferLocked = true;
        (bool sent,) = payable(recipient).call{ value: amount }("");
        transferLocked = false;
        if (!sent) revert TransferFailed();
    }
}
