# GenLayer Gateway Architecture

## Consensus boundary

The UI, API, MongoDB index, Vercel functions, GitHub Actions, and relay provide convenience and liveness. The GenLayer Intelligent Contract stores the intended authoritative decision. In version `0.1.0`, however, the authorized hub relayer is still able to submit return bytes to the LayerZero forwarder; Base does not yet verify a cryptographic GenLayer finality proof. This is a disclosed testnet trust boundary.

## Request path

1. A Base Sepolia caller pays exactly `0.001 ETH` to `GatewayRouter.requestDecision`.
2. The router derives a domain-separated request ID and stores the request commitment.
3. The transport adapter dispatches an authenticated request envelope.
4. The GenLayer adjudicator validates the envelope and evaluates the versioned evidence.
5. GenLayer finalizes `PASS`, `FAIL`, or `UNDETERMINED`.
6. The finalized result is persisted before response dispatch.
7. The Base receiver authenticates LayerZero delivery and configured identities; it cannot independently prove the GenLayer transaction finalized.
8. The router records the result once and attempts the application callback.
9. A failed callback can be retried without changing or replaying the verdict.
10. Results received after the router request expiry are rejected so the application timeout policy remains authoritative.

## Message commitment

Every request binds:

- protocol version;
- Base Sepolia chain ID;
- origin router and origin application;
- requester and callback;
- application nonce and expiry;
- question hash;
- policy hash;
- evidence-manifest hash.

The request ID is the hash of this commitment. A response must bind the same request ID, origin, policy hash, evidence hash, and transport source.

## Reviewed route registry

`GatewayRouteRegistry` is the on-chain allowlist foundation for the multi-contract release. A route binds a stable route ID to the exact GenLayer destination contract, method selector, argument schema, and result schema. Routes are activated and paused by the protocol owner; unknown IDs, duplicate registrations, zero schemas, and zero selectors are rejected. The deployed v1 router does not yet consume this registry, so the current escrow route remains the only live execution path. A route-aware router must include the route ID and all registry fields in its request commitment before any secondary route is activated.

## Serverless liveness

MongoDB persists reconciliation state. Vercel Cron, GitHub Actions, operators, and permissionless retry calls may all advance delivery. Each operation uses an idempotency key, a short database lease, bounded exponential backoff, and an on-chain state check before submitting a transaction.

This architecture provides recoverability, not an always-on delivery guarantee. Production deployment requires durable relay infrastructure and a destination-verifiable proof or security model that removes unilateral result-forgery authority from the relay.
