# Live Testnet Deployment Report

Generated on September 1, 2026.

## Current Status

Base Sepolia, Arbitrum Sepolia, and GenLayer Bradbury contracts are deployed and read-back verified. The Vercel UI/API is live, MongoDB health checks pass, the end-to-end smoke test passed, and the 20-job phase gate passed with **19 finalized correct settlements out of 20**, exceeding the required 17.

- Deployment manifest: `deployments/testnet.json`
- Smoke report: `phase-gate-results/1788222678333-smoke.json`
- Aggregate phase-gate report: `phase-gate-results/1788230198689-aggregate.json`
- Detailed evidence: `docs/TESTNET_PHASE_GATE.md`
- Production testnet app: `https://genlayer-gateway.vercel.app`
- Vercel deployment: `dpl_4NZ9cbZGqdqqPvmUn2ZbyWNHKxTD`

## Network Configuration

| Network | Chain ID | LayerZero EID | Endpoint V2 |
| --- | ---: | ---: | --- |
| Base Sepolia | `84532` | `40245` | `0x6EDCE65403992e310A62460808c4b910D972f10f` |
| Arbitrum Sepolia | `421614` | `40231` | `0x6EDCE65403992e310A62460808c4b910D972f10f` |
| GenLayer Bradbury | `4221` | n/a | n/a |

## Deployed Components

- Base Sepolia: `LayerZeroGatewaySender` `0x9c6d6a8178fccb3e2adabe591ad77bbfe31b52dc`
- Base Sepolia: `GatewayRouter` `0x18c9495f1fcdd86fcf6e102338d8b567e867dc7f`
- Base Sepolia: `LayerZeroResultReceiver` `0x0527462e78cc4839a64542436abe85f9eaced7d5`
- Base Sepolia: `AgentEscrow` `0xa4ae62a8fd810b0b9c53edf4d57bc8968a8517cb`
- Arbitrum Sepolia: `LayerZeroHubReceiver` `0x26ca0d2d6994bc9e2cacdb7d125778c68fc59e8f`
- Arbitrum Sepolia: `LayerZeroHubForwarder` `0x65bcaae5802adbc92d7959583a316831f1c4b77b`
- GenLayer Bradbury: `GatewayAdjudicator` `0xE2Fe333320E15a81D73BdF02e9c4a4Ee953124C9`

All contract ownership is assigned to `0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E`.

## Live Verification Results

- Deployment read-back verifier: passed.
- Vercel health, config, evidence, and authenticated reconciliation endpoints: passed.
- MongoDB connectivity: passed.
- Fresh end-to-end smoke: 1/1 correct finalized settlement.
- Phase gate: 20 submitted, 19 finalized, 19 expected-decision matches, 19 correct Base settlements.
- Outlier: `job-04` Bradbury transaction finalized without a stored Intelligent Contract result; the protocol failed closed and did not settle it.

## LayerZero Delivery Finding

The first smoke exposed a 200,000-gas receive option that was insufficient for a cold destination execution. Verified packets were recovered through Endpoint V2's permissionless `lzReceive` path. The hosted return path now uses a 1,000,000-gas receive option.

The deployed Base sender still stores the original 200,000-gas option and is owned by the protocol owner. A protocol-owner transaction is required to update it on-chain. Until that transaction is executed, the live phase tooling retains permissionless packet retry support and records retry transaction hashes.

## Trust Boundary

The result attestor prevents an ordinary relayer from changing a result, but it remains an operational trust assumption. It is not a cryptographic proof of GenLayer finality. This deployment is testnet evidence only and is not a claim of trustless or mainnet production readiness.

Before mainnet, replace or strengthen this assumption with destination-verifiable GenLayer finality, a threshold attestor quorum, independent slashed attestors, a native GenLayer bridge verification mechanism, or an externally audited security model.

## Remaining Mainnet Blockers

1. Update the deployed Base sender's LayerZero receive option through the protocol owner.
2. Replace or formally accept and audit the result-attestor trust model.
3. Deploy and configure the additive v0.2 quorum forwarder; the source implementation now exists, but no live migration is claimed until the protocol owner configures it.
4. Complete an independent smart-contract and operational-security audit.
5. Rotate temporary testnet infrastructure secrets before any production use.
