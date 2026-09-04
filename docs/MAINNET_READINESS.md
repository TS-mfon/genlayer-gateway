# Mainnet Readiness and v0.2 Migration

As of September 3, 2026, Gateway is a verified testnet MVP, not a mainnet-ready trustless protocol. The published v0.1 deployment and its 20-job evidence remain valid, but the live route uses one operational result-attestor key.

## Blocker status

| Blocker | Status | Resolution |
| --- | --- | --- |
| Single result attestor | Code path available | Deploy `LayerZeroHubForwarderQuorum`, configure at least two independent signers, and complete an independent audit. |
| GenLayer finality proof | Open | A quorum attestor is defense-in-depth, not a cryptographic proof. Add a destination-verifiable proof, native bridge verification, slashing, or formally accepted security model. |
| Finalized transaction without result | Code hardened | Relay enters `REQUIRES_REVIEW`, never returns or settles, and supports reviewed resubmission of the same committed adjudication. |
| Base sender gas option | Operational | Protocol owner must call `setOptions` with the tested 1,000,000 receive-gas option on the deployed Base sender. |
| Serverless liveness | Bounded | Keep Vercel cron, GitHub Actions, leases, permissionless retry, and monitoring; do not describe this as durable-worker liveness. |
| Independent audit | Open | Required before mainnet funds or a trustless-security claim. |

## v0.2 deployment sequence

1. Generate and independently control three attestor keys; do not place private keys in the repository or Vercel client variables.
2. Deploy `DeployHubQuorum.s.sol` on Arbitrum Sepolia with the three public signer addresses and a `2-of-3` quorum.
3. Run `ConfigureHubQuorum.s.sol` with the existing trusted GenLayer sender, Base router, Base result receiver, hub receiver, and authorized relayer.
4. With the protocol owner, update the deployed Base `LayerZeroResultReceiver` to trust the new quorum forwarder. Do not remove the v0.1 forwarder until the v0.2 smoke test passes.
5. Update the relay to produce two or more signatures for the v0.2 digest and verify signer epoch/configuration before dispatch.
6. Run a fresh one-job smoke test, then a fresh 20-job gate requiring at least 17 finalized correct settlements.
7. Publish addresses, owner/configuration read-backs, every LayerZero GUID, GenLayer transaction, attestation signer set/epoch, callback, and settlement evidence.
8. Obtain external audit/formal acceptance before considering any mainnet deployment.

## Security invariants

- A result is accepted only when the result transaction hash, request ID, commitments, origin message, destination, message hash, signer epoch, and forwarder address match.
- Every attestation must recover to an authorized signer.
- Duplicate signers cannot count twice toward quorum.
- Signer or quorum changes increment the signer epoch and invalidate old signatures.
- A finalized GenLayer transaction with no stored result never produces a return message or payment.
- An `UNDETERMINED` escrow result is not refundable before its job deadline.
- Vercel, MongoDB, relayers, and webhooks are not adjudication authorities.

The v0.2 quorum implementation reduces single-key compromise risk. It does not prove that GenLayer finalized the signed result; that limitation must remain explicit in deployment reports and product claims.
