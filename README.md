# GenLayer Gateway

> **The reasoning layer for every blockchain application.**

GenLayer Gateway is an interchain adjudication protocol that lets an application on Base Sepolia request decentralized AI-assisted judgment from GenLayer and receive an authenticated result back on its native chain.

The application does not migrate to GenLayer. Its users do not switch networks or acquire GEN. The origin application owns funds and execution policy, the transport carries authenticated messages, and a GenLayer Intelligent Contract finalizes `PASS`, `FAIL`, or `UNDETERMINED` from versioned evidence.

**Version 0.1.0 is testnet-only, unaudited software. It must not be used with production funds.**

## Live Testnet Status

As of September 1, 2026:

- Base Sepolia, Arbitrum Sepolia, and GenLayer Bradbury deployments are live and read-back verified.
- The Vercel testnet application is live at `https://genlayer-gateway.vercel.app` with MongoDB-backed API, evidence, health, and reconciliation routes.
- The fresh end-to-end smoke test passed.
- The 20-job live phase gate passed with `19/20` finalized expected decisions and `19/20` correct Base escrow settlements; the required threshold was `17`.
- `job-04` is the documented outlier: Bradbury finalized the transaction but stored no Intelligent Contract result, and Gateway correctly failed closed without settling it.

See `docs/LIVE_DEPLOYMENT_REPORT.md`, `docs/TESTNET_PHASE_GATE.md`, and `deployments/testnet.json` for addresses and transaction-level evidence.

## Contents

- [Problem](#problem)
- [Protocol design](#protocol-design)
- [Trust model](#trust-model)
- [Repository layout](#repository-layout)
- [Request lifecycle](#request-lifecycle)
- [Contracts](#contracts)
- [GenLayer adjudication](#genlayer-adjudication)
- [Transport policy](#transport-policy)
- [API and database](#api-and-database)
- [Evidence model](#evidence-model)
- [Fees](#fees)
- [Agent escrow demonstration](#agent-escrow-demonstration)
- [Local development](#local-development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Operational recovery](#operational-recovery)
- [Known limitations](#known-limitations)
- [Browser test application](#browser-test-application)

## Problem

Smart contracts execute deterministic rules, but autonomous applications increasingly depend on evidence that is not naturally reducible to deterministic bytecode: source repositories, test results, documents, task requirements, deployment records, and ambiguous real-world conditions.

Using a conventional backend to decide whether the evidence is valid creates a centralized oracle. Requiring every existing application to migrate to GenLayer creates an adoption barrier.

Gateway exposes GenLayer adjudication as an asynchronous interchain primitive:

```text
Base application
    │ request + fee
    ▼
GatewayRouter
    │ authenticated message
    ▼
Transport adapter
    │
    ▼
GenLayer GatewayAdjudicator
    │ leader + validator evaluation
    ▼
Finalized verdict
    │ authenticated response
    ▼
GatewayRouter
    │ idempotent callback
    ▼
Origin application
```

## Protocol design

### Design goals

- Keep users and application funds on the origin chain.
- Make the GenLayer result independently verifiable.
- Minimize relayer authority and make the remaining relay trust explicit and replaceable.
- Bind every result to an immutable request, policy, and evidence commitment.
- Support asynchronous execution, retries, timeouts, and callback failures.
- Let transport implementations evolve without changing the application interface.

### Non-goals

- Gateway is not a token bridge.
- Gateway is not a generic text-generation API.
- Gateway does not custody application escrow funds.
- MongoDB is not the source of protocol truth.
- Vercel or GitHub Actions do not provide guaranteed relayer liveness.
- Version 0.1.0 does not claim Base mainnet or production Hyperlane support.

## Trust model

The authoritative state is split deliberately:

| Component | Authoritative for | Not authoritative for |
| --- | --- | --- |
| Base application | Funds and economic policy | GenLayer judgment |
| `GatewayRouter` | Request/result commitment and callback state | Evidence interpretation |
| LayerZero contracts | Endpoint and configured remote-sender authentication | GenLayer decision correctness |
| GenLayer adjudicator | Final decision and stored result | Origin-chain fund custody |
| API/MongoDB | Search, indexing, retries, UI lifecycle | Verdict creation or modification |
| Authorized hub relayer | Delivery of GenLayer requests/results in version `0.1.0` | Evidence interpretation |

The hub forwarder now requires a separate result-attestor signature over the complete result envelope and verifies that the result references the stored inbound hub message and original request. This prevents an authorized delivery relay from changing or inventing a result without the attestor key. It is still not a cryptographic proof of GenLayer finality: the attestor is an operational trust assumption and must be separately secured, rotated, monitored, and disclosed for version `0.1.0`.

## Repository layout

```text
apps/web/                 Next.js UI, docs, API, MongoDB, reconciliation
contracts/                Base Sepolia Solidity contracts and Foundry tests
genlayer/                 Intelligent Contract and GenLayer tests
packages/protocol/        Shared schemas, limits, lifecycle, result types
docs/                     Architecture and threat-model specifications
tests/jobs/               Twenty-job phase-gate dataset
.github/workflows/        CI and redundant reconciliation triggers
```

## Request lifecycle

The off-chain index uses the following explicit lifecycle:

```text
CREATED
  → DISPATCHED
  → DELIVERED
  → ADJUDICATING
  → REQUIRES_REVIEW (only when Bradbury finalizes without a stored result)
  → FINALIZED
  → RETURN_DISPATCHED
  → RETURNED
  → CALLBACK_PENDING
  → CALLBACK_EXECUTED
```

`FAILED`, `TIMED_OUT`, and `REQUIRES_REVIEW` are recoverable operational states for selected transitions. A no-result finalization is fail-closed: it cannot dispatch a return message or settle escrow. A retry may resubmit the same committed GenLayer adjudication only after review; a retry never changes the request ID or commitments.

`GatewayRouter` uses a smaller on-chain state machine: `Dispatched`, `Finalized`, `CallbackPending`, and `CallbackExecuted`.

## Contracts

### `GatewayRouter.sol`

The router:

- rejects deployment outside chain ID `84532`;
- requires exactly `0.001 ETH` per request;
- caps question, policy, and evidence URI sizes;
- requires an expiry and monotonic application nonce;
- derives a domain-separated request ID;
- stores policy/evidence commitments;
- calls a replaceable `ITransportAdapter`;
- accepts results only from the dedicated authenticated result receiver;
- rejects commitment mismatches, invalid verdicts, duplicates, and replays;
- persists a verdict before attempting the callback;
- permits permissionless callback retry;
- accrues only the portion of the fixed fee not spent on delivery.

### `AgentEscrow.sol`

The demonstration escrow:

- keeps bounty custody on Base Sepolia;
- separates the client and worker roles;
- requires a committed verification policy;
- accepts versioned evidence from the worker;
- asks Gateway for adjudication;
- releases to the worker on `PASS`;
- refunds the client on `FAIL`;
- records `UNDETERMINED` without guessing;
- supports explicit timeout and refund handling;
- prevents an `UNDETERMINED` refund until the job deadline has elapsed;
- accepts callbacks only from `GatewayRouter`.
- owns its verification nonce so separate jobs cannot collide through caller-supplied nonces.

### `ITransportAdapter.sol`

Outbound transport adapters expose a minimal quote/dispatch interface. The included LayerZero path adds a source sender, hub receiver, authorized relay, hub forwarder, and Base result receiver. The Base receiver authenticates the LayerZero endpoint, hub sender, GenLayer sender identity, router destination, protocol version, origin message ID, and result transaction hash before calling `GatewayRouter.handleResult`; the hub forwarder also verifies the stored inbound request and separate result-attestor signature.

## GenLayer adjudication

`GatewayAdjudicator` uses a concretely pinned GenVM runner. It accepts calls only from its configured submitter and supports Base Sepolia requests.

For each request it:

1. validates IDs, hashes, chain, origin, sizes, and HTTPS evidence URI;
2. rejects duplicate finalization;
3. retrieves bounded evidence;
4. places immutable system rules before untrusted evidence;
5. asks the leader for strict JSON containing `decision` and `reason`;
6. makes validators independently repeat the evaluation;
7. compares the substantive decision rather than mere output shape;
8. stores a compact finalized result.

`UNDETERMINED` is mandatory. Missing or unsafe evidence must not become an optimistic `PASS`.

## Transport policy

Hyperlane remains a future adapter only if an official live route to the selected GenLayer network can be verified, including domains, mailbox/router deployments, remote sender, security module, fee quoting, and round-trip delivery.

Version `0.1.0` implements the GenLayer Foundation bridge pattern with LayerZero-compatible sender, hub receiver, bounded Vercel/GitHub relay, hub forwarder, and Base result receiver. It must be displayed as `LayerZero authorized-relay prototype`, not as Hyperlane and not as a trustless bridge. Simulated delivery never counts toward the official integration gate.

`LayerZeroHubForwarderQuorum.sol` is an additive v0.2 migration target. Deploy it on the hub with at least two independent attestor keys, configure the Base result receiver to trust the new forwarder, and cut over the relay only after an owner-controlled migration and fresh smoke/phase-gate evidence. The v0.2 quorum is defense-in-depth, not proof of GenLayer finality.

## API and database

The versioned API includes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/requests` | Register an EIP-712 signed request |
| `GET` | `/api/v1/requests/:id` | Read indexed lifecycle state |
| `GET` | `/api/v1/requests/:id/result` | Read an indexed finalized result |
| `POST` | `/api/v1/requests/:id/retry` | Queue permissionless reconciliation |
| `GET/POST` | `/api/v1/reconcile` | Protected bounded reconciliation |
| `GET` | `/api/v1/health` | Database and service health |
| `GET` | `/api/v1/config` | Public testnet configuration |

MongoDB stores request metadata, unique requester nonces, lifecycle events, attempts, webhook delivery IDs, and short reconciliation leases. Unique indexes make registration and webhook processing idempotent.

The API verifies EIP-712 signatures but does not replace the origin-chain transaction. The fixed request fee is enforced by `GatewayRouter`, not by a database flag.

## Evidence model

Evidence manifests are versioned and bounded to 12 items. Every item contains a type, URI/reference, digest, and compact metadata.

Supported v1 types:

- `GITHUB_COMMIT`
- `CONTENT_HASH`
- `TRANSACTION`
- `BLOCK`
- `URL`

Use immutable evidence whenever possible. A GitHub branch name, mutable release asset, unpinned package version, or `latest` block is not sufficient for financial settlement without an immutable snapshot and digest.

The adjudicator rejects non-HTTPS evidence URIs and caps retrieved content. Production deployments must additionally enforce private-network blocking, redirect limits, content-type policy, and decompression limits in any evidence proxy.

## Fees

Every Base Sepolia request pays exactly `0.001 ETH`.

The router asks the adapter for its delivery quote, forwards that amount, and accrues the remainder. It rejects a delivery quote larger than the prepaid fee. This fixed testnet model is intentionally simple and must be replaced with bounded dynamic quoting before mainnet.

The fixed fee does not guarantee that all possible GenLayer work is economically covered. Request and evidence limits constrain exposure during the testnet phase.

## Agent escrow demonstration

The demonstration proves a full agent-to-agent settlement path:

1. Client creates a job and locks bounty funds.
2. Worker submits a versioned evidence URI and digest.
3. Client pays the Gateway request fee.
4. Gateway dispatches the committed question, policy, and evidence.
5. GenLayer finalizes a verdict.
6. The authenticated verdict returns to Base Sepolia.
7. `AgentEscrow` releases, refunds, or enters `Undetermined`.

Gateway never holds the bounty.

## Local development

### Requirements

- Node.js 22+
- npm 11+
- Foundry
- `uvx`
- MongoDB Atlas or a local MongoDB-compatible endpoint
- GenLayer test tooling for direct/integration tests

### Install

```bash
npm install
cp .env.example .env.local
```

### Run

```bash
npm run dev
```

### Validate

```bash
npm run test:genlayer:lint
npm run test:contracts
npm run test
npm run build
```

## Testing

Each phase uses 20 jobs and requires at least 17 expected passes before progression. Expected rejection of a malicious job counts as a pass.

Local deterministic tests cover validation, state transitions, fees, replay protection, access control, callback retry, escrow behavior, and the complete mocked LayerZero hub round trip. GenLayer direct tests cover canonical Base request recomputation, evidence-body digest verification, policy commitments, authorization, and result persistence. Official testnet tests are still required for actual consensus and delivery.

Set `RUN_GENLAYER_TESTNET_TESTS=1` only when funded/configured accounts and immutable public evidence are ready.

The official integration gate must not use a simulated route.

## Deployment

Development remains local until explicit authorization to create a GitHub repository.

When authorized:

1. create the GitHub repository;
2. configure protected environments and encrypted secrets;
3. connect Vercel through the GitHub integration;
4. create separate preview and production-testnet MongoDB databases;
5. deploy transport, router, escrow, and GenLayer contracts in the documented order;
6. populate public addresses only after successful verification;
7. run the 20-job official-testnet gate;
8. publish only the verified active transport name.

## Security

See `docs/THREAT_MODEL.md` for the full model.

Critical invariants:

- Only the configured Base result receiver can submit a result to the router.
- A request can finalize once.
- Result commitments equal request commitments.
- A callback cannot release escrow twice.
- MongoDB and the public API cannot create an on-chain verdict; the authorized hub relayer remains a disclosed bridge trust assumption.
- An `UNDETERMINED` decision cannot release worker funds.
- A timeout does not silently choose a winner.
- Operational retries are idempotent.

Before mainnet, obtain an independent audit covering contracts, transport configuration, GenLayer validator design, evidence retrieval, billing, key custody, and serverless recovery.

## Operational recovery

Vercel Cron and GitHub Actions call the protected reconciliation endpoint. Reconciliation reads Base Sepolia, advances the MongoDB index, and schedules bounded exponential retries. A short MongoDB lease prevents duplicate operators from processing the same request concurrently.

GitHub scheduling and Vercel invocation are best-effort. Permissionless retry endpoints let users or operators request reconciliation, but production liveness requires durable relay infrastructure.

## Known limitations

- Testnet-only and unaudited.
- Fixed fee rather than dynamic economic quoting.
- No deployment addresses or successful official-testnet round-trip transaction hashes are included yet.
- The authorized hub relayer can still forge return bytes because Base cannot currently verify a GenLayer finality proof.
- Vercel and GitHub scheduled invocations are bounded triggers, not durable worker infrastructure.
- The required 20 official-testnet jobs with at least 17 correct finalized outcomes have not been executed.
- The example adjudicator evaluates one bounded HTTPS evidence document rather than a multi-artifact retrieval graph.
- No appeal mechanism is included in v0.1.0.
- No stablecoin billing, subscription, sponsorship, or mainnet treasury management.
- No guarantee of always-on delivery under Vercel/GitHub-only operation.

## License

No license has been selected. Add one only after the project owner explicitly chooses the licensing model.

## Browser test application

The deployed test application is organized around a simple two-party workflow rather than a protocol dashboard:

| Route | Use |
| --- | --- |
| `/` | Choose Client / Post a Job or Worker / Browse Jobs |
| `/create-job` | Client creates and funds an escrow job on Base Sepolia |
| `/dashboard/client` | Client sees jobs created in the current browser |
| `/dashboard/worker` | Worker sees live task cards in the current browser |
| `/jobs/:id` | Job details, progress rail, and next action |
| `/test-console` | Guided two-wallet escrow-to-GenLayer test flow |
| `/playground` | Compose a reviewed route request and copy integration examples |
| `/routes` | Reviewed GenLayer route catalogue and executor readiness |
| `/docs/routes` | Route trust, schema, activation, and selection model |
| `/docs/adapters` | Shared, managed, and self-hosted custom-contract integration paths |
| `/docs/ui` | Full browser testing guide |

`GET /api/v1/routes` exposes the reviewed GenLayer destination profiles. The current testnet profile targets `GatewayAdjudicator`; arbitrary destination addresses are not accepted as trusted routes. A future multi-contract release must add typed method arguments, result schemas, and destination-specific verification before exposing additional profiles.

A newly created job is immediately persisted under `genlayer-gateway.jobs.v1` in browser storage. This prevents navigation or refresh from making a successful creation appear to disappear. Browser state is only a UI projection: contract state, transaction receipts, request IDs, GenLayer results, and callbacks remain authoritative.

### Gateway beyond the demo adjudicator

The escrow demo targets the deployed `GatewayAdjudicator`. The protocol is designed to grow into a route registry for multiple GenLayer Intelligent Contracts. Each route must bind a destination contract, allowed method/schema, source origin, callback policy, transport security, fee policy, timeout, and result schema. A caller should be able to select a reviewed route and submit typed arguments without redeploying a GenLayer contract. Arbitrary destination contracts must never be accepted as trusted solely because an address is syntactically valid.

#### Reviewed route profiles

The server supports an explicit route registry through `GENLAYER_ROUTES_JSON`. This is a JSON array of reviewed profiles, for example:

```json
[
  {
    "id": "work-adjudicator",
    "label": "Work adjudicator",
    "originChainId": 84532,
    "destinationChainId": 4221,
    "destinationContract": "0x1111111111111111111111111111111111111111",
    "method": "adjudicate",
    "resultSchema": "GatewayStoredResultV1",
    "argumentSchema": "GatewayAdjudicateArgsV1",
    "status": "ACTIVE",
    "trustModel": "THRESHOLD_ATTESTORS"
  }
]
```

Profiles are schema-validated and filtered to the supported Base Sepolia → GenLayer Bradbury route. The registry does not itself provide arbitrary contract invocation or cryptographic finality. Before activating a second contract, the relay must add its typed argument encoder, result decoder, destination authorization, replay handling, and independent integration tests; otherwise the profile remains `PAUSED`.

The repository also includes `GatewayRouteRegistry.sol`, an on-chain allowlist foundation that binds a route ID to a destination contract, method selector, argument schema, and result schema. It is deliberately additive and is not wired into the deployed v1 escrow router yet. The next protocol version must include those bindings in the on-chain request ID and result commitment before a secondary GenLayer contract is activated.

The request API accepts an optional `routeId`. Omitting it preserves the deployed demo behavior and selects `gateway-adjudicator`; supplying one selects an active allowlisted profile. This selection is not a free-form contract call: the origin-chain envelope and the relay implementation must eventually commit to and enforce the same route ID and destination-specific schema. Until that v2 on-chain envelope is deployed, non-default profiles should remain paused.
