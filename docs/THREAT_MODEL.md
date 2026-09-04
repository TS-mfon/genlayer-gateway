# Threat Model

## Protected assets

- Authenticity of GenLayer verdicts.
- Integrity of request policy and evidence commitments.
- Escrowed application funds.
- Relayer and deployer keys.
- Operational request metadata.

## Trust assumptions

- Base Sepolia and the selected GenLayer testnet provide their documented consensus properties.
- The active transport authenticates the configured remote domain and gateway.
- GenLayer validators can retrieve enough stable evidence to reach consensus.
- Vercel, GitHub Actions, and MongoDB cannot directly call the router or alter an existing result.
- The authorized hub relayer can currently submit return bytes to the hub forwarder and is therefore trusted not to forge a verdict until a destination-verifiable GenLayer finality proof exists.

## Primary attacks and controls

| Attack | Control |
| --- | --- |
| Forged response from arbitrary caller | LayerZero endpoint check, trusted hub sender, trusted GenLayer sender, router destination, protocol version, and bound commitments |
| Forged response by authorized hub relayer | Bound inbound request plus separate result-attestor signature; still **not cryptographically solved in v0.1.0** because the attestor is an operational trust assumption |
| Replay | Domain-separated request IDs, monotonic application nonce, processed-result flag |
| Late result after expiry | Router rejects `handleResult` after the committed expiry; application can enter its timeout path |
| Duplicate callback | Terminal escrow state and callback-attempt idempotency |
| Treasury drain | Exact prepaid fee, bounded message/evidence sizes, no sponsored writes |
| Prompt injection | Immutable system policy, explicit untrusted evidence delimiters, strict output schema |
| Evidence mutation | Commit SHA, transaction/block reference, and content digest requirements |
| Relayer censorship | Persisted verdict, permissionless retries, redundant Vercel/GitHub triggers |
| Callback reentrancy | Checks-effects-interactions and callback lock |
| Secret exposure | Server-only environment variables and dedicated least-privilege wallets |
| SSRF through evidence | HTTPS allowlist policy, redirect/size/time limits, no private-network destinations |

## Mainnet prohibition

Version `0.1.0` is testnet-only. Deployment scripts reject any origin chain other than Base Sepolia (`84532`). Mainnet requires an external audit, production transport verification, managed key custody, durable relayers, economic modeling, monitoring, and incident response.
