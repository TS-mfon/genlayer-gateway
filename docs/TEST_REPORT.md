# Build and Test Report

**Run date:** August 30, 2026

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| Solidity formatting | PASS | `forge fmt --root contracts --check` |
| Solidity unit/state tests | PASS | 33 tests across `GatewayPhaseGate.t.sol`, `LayerZeroBridgePath.t.sol`, and `SecurityAndAdmin.t.sol` |
| Solidity coverage | PASS with fallback | `forge coverage --root contracts --ir-minimum`; 72.26% line, 77.65% function coverage |
| GenLayer lint/validation | PASS | `genvm-lint check genlayer/contracts/gateway_adjudicator.py` |
| GenLayer schema | PASS | 6 public methods extracted |
| GenLayer direct tests | PASS | 6 tests |
| Protocol TypeScript lint | PASS | `npm run lint` |
| Web/API tests | PASS | 36 Vitest tests |
| Protocol tests | PASS | 4 Vitest tests |
| Production build | PASS | `npm run build`; 17 static/dynamic routes generated |
| Script syntax | PASS | `node --check scripts/*.mjs`, `bash -n scripts/*.sh` |
| Dependency audit | PASS (last successful run) | `npm audit --audit-level=moderate`: 0 vulnerabilities; final rerun was blocked by registry DNS `EAI_AGAIN` |
| Phase-gate fixture | PASS | Exactly 20 work submissions present |
| Official testnet round trip | NOT RUN | Requires deployed addresses, funded accounts, RPCs, and live transport |

## Test Coverage Matrix

- Router: exact fee, expiry, size bounds, nonce replay, commitments, invalid decisions, callback execution/retry, pause/admin, late-result rejection.
- Escrow: worker/client authorization, policy/evidence commitments, pass payout, fail refund, undetermined holding, timeout protection, reentrancy-locked payments.
- Transport: trusted endpoint/senders, GUID replay, message replay, result hash binding, destination/source identity, ownership rotation.
- GenLayer: constructor/configuration, submitter authorization, canonical request ID, evidence body digest, HTTP/error outcomes, prompt-injection delimiting, result persistence.
- API: schema/registration path, HMAC signature handling, evidence 200/404/503, reconciliation authorization, relay validation/encoding, request lifecycle tests.

## Release Gate

The local build gate passes. The functional-MVP release gate does not: no official-testnet 20-job execution report exists. The transport now binds results to the stored inbound request and requires a separate attestor signature, but v0.1.0 remains an authorized-relay/attestor testnet prototype without a cryptographic Base-verifiable GenLayer finality proof.
