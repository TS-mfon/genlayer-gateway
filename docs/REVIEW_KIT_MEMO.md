---
submission_id: local-genlayer-gateway
project_name: GenLayer Gateway
review_status: ready_for_human_review
path: intelligent_contract
confidence: high
---

# GenLayer Gateway — Reviewer Memo

## Snapshot

GenLayer Gateway is a Base Sepolia agent-work escrow and interchain adjudication protocol. A client funds a job, a worker submits content-addressed evidence, a deployed Bradbury Intelligent Contract evaluates the evidence through validator consensus, and an authenticated result returns through an Arbitrum Sepolia LayerZero hub to settle the Base escrow.

## Reviewer Orientation

The finished testnet project appears strong and above the Project bar. GenLayer is central to a disputed, value-bearing decision; the live evidence now includes deployed source/configuration, a successful end-to-end smoke test, and a 20-job gate with 19 correct finalized settlements. The primary reservation is not GenLayer fit but end-to-end trust minimization: Base still accepts a separately signed operational attestation rather than a cryptographic proof of Bradbury finality.

## GenLayer Fit

GenLayer is essential to the product's trust model. Removing it replaces neutral multi-validator evidence adjudication with a centralized operator deciding whether escrowed funds are released, refunded, or held as undetermined. The contract verifies current external evidence, committed body hashes, and a domain-specific policy; it is not using consensus for generic generation or advisory text.

## Contract Engineering

The Intelligent Contract has a pinned GenVM dependency, typed state, owner and submitter authorization, canonical Base request-ID recomputation, policy and evidence commitments, HTTPS web retrieval, prompt-injection separation, constrained verdicts, and validator re-evaluation of both the decision and fetched body hash. This is substantive validation rather than output-shape checking. The main limitation is the destination trust boundary: the result attestor is operational, and one of 20 Bradbury transactions finalized without storing a result. Gateway handled that outlier correctly by failing closed.

## Engineering Quality

The implementation is coherent across Foundry contracts, the GenLayer contract, Next.js UI/API, MongoDB reconciliation, Vercel deployment, LayerZero transport, result attestation, deployment/read-back scripts, durable phase checkpoints, permissionless packet retries, and protocol documentation. The live run exposed insufficient LayerZero receive gas, public RPC instability, Vercel 5xx responses, expiry behavior, and a Bradbury no-result edge case; the tooling recovered or failed closed rather than fabricating success.

## Strongest Positives

- GenLayer consensus directly settles a contested Base escrow outcome.
- Live testnet evidence proves the complete request, adjudication, return, callback, and settlement path.
- The 20-job gate produced 19 expected decisions and 19 correct settlements across PASS, FAIL, and UNDETERMINED cases.

## Main Concerns

- Base does not verify a cryptographic GenLayer finality proof; the result attestor remains a disclosed operational trust assumption.
- The deployed Base sender still stores the original 200,000-gas LayerZero option and requires a protocol-owner update; permissionless retries currently provide recovery.
- `job-04` finalized on Bradbury with no stored Intelligent Contract result, so explicit recovery semantics for this network outcome should be designed before mainnet.

## Human Verification Checklist

- Verify the phase-gate report counts and sample transaction/GUID pairs in `docs/TESTNET_PHASE_GATE.md`.
- Inspect the deployed Bradbury source and configuration at `0xE2Fe333320E15a81D73BdF02e9c4a4Ee953124C9`.
- Confirm the separate attestor key custody, rotation plan, monitoring, and incident process.
- Require a protocol-owner transaction to raise the deployed Base sender's LayerZero receive option.
- Require an independent audit before production funds or mainnet claims.

## Evidence Access

- Local repository — reviewed — contracts, Intelligent Contract, app, API, tests, scripts, and docs inspected.
- `https://genlayer-gateway.vercel.app` — reviewed — production testnet app and protected runtime endpoints verified.
- `deployments/testnet.json` — reviewed — deployed addresses, ownership, smoke, and phase-gate evidence.
- `phase-gate-results/1788230198689-aggregate.json` — reviewed — 20 submitted, 19 finalized, 19 correct settlements.
- Deployed Bradbury contract — reviewed — live configuration and source/read-back path verified.
