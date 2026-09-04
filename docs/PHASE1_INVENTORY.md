# Phase 1 Codebase Inventory

This inventory records the review scope as of August 29, 2026. Generated artifacts, dependency directories, Foundry outputs, Next.js build outputs, and Python caches are excluded.

## System Modules

| Module | Responsibility | Authoritative for |
| --- | --- | --- |
| Base contracts | Request commitments, fixed fee, callbacks, escrow settlement | Origin-chain funds and execution |
| LayerZero-compatible contracts | Authenticated request/result transport through a hub | Configured route identity and replay controls |
| GenLayer Intelligent Contract | Evidence retrieval, validator comparison, final verdict storage | `PASS`, `FAIL`, or `UNDETERMINED` adjudication |
| Next.js API | On-chain registration proof, indexing, retries, health, evidence fixtures | Operational metadata only |
| Serverless relay | Bounded request delivery and result forwarding | Liveness/orchestration, not verdict authority |
| MongoDB | Lifecycle index, leases, webhook IDs, nonces, cached results | Non-authoritative operational state |
| React client | Base Sepolia wallet flow and lifecycle inspection | User interaction only |
| Deployment/verification scripts | Deploy, configure, transfer ownership, verify route, run phase gate | Operational reproducibility |

## Solidity Contracts

### `GatewayRouteRegistry`

The additive multi-contract foundation. `registerRoute` creates an owner-controlled route binding for a stable route ID, exact GenLayer destination, method selector, argument schema, and result schema. `setRouteStatus` pauses or reactivates a known route; `getRoute` and `isActive` expose read-only discovery. Zero identifiers, selectors, schemas, duplicate IDs, unknown IDs, and unauthorized mutations revert. This registry is not wired into the deployed v1 router yet.

### `GatewayRouter`

State transitions: `None -> Dispatched -> Finalized -> CallbackExecuted` or `CallbackPending -> CallbackExecuted`.

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(initialOwner, initialTransport)` | deploy | Enforces Base Sepolia, nonzero owner/transport, initializes ownership and transport. |
| `onlyOwner` | modifier | Restricts protocol administration. |
| `onlyResultReceiver` | modifier | Restricts finalized result delivery. |
| `requestDecision(...)` | external payable | Enforces exact `0.001 ETH`, sizes, HTTPS evidence, nonce, expiry, commitments, transport quote; stores request and dispatches transport message. |
| `handleResult(...)` | external | Authenticates result receiver; validates request status, decision, evidence/policy commitments, and result transaction hash; stores final result and attempts callback. |
| `retryCallback(requestId)` | external | Permissionlessly retries a failed callback. |
| `setTransport(newTransport)` | owner | Rotates outbound transport. |
| `setResultReceiver(newReceiver)` | owner | Rotates authenticated return receiver. |
| `getRequestStatus(requestId)` | external view | Returns the on-chain request lifecycle state. |
| `transferOwnership(newOwner)` | owner | Transfers router administration. |
| `setPaused(newPaused)` | owner | Pauses new requests without blocking result completion. |
| `withdrawFees(recipient)` | owner | Withdraws accrued protocol fees. |
| `_attemptCallback(requestId, request)` | internal | Executes the application callback with a gas limit and reentrancy lock; stores pending/executed state. |

Events: `RequestDispatched`, `ResultFinalized`, `CallbackAttempted`, `TransportUpdated`, `ResultReceiverUpdated`, `OwnershipTransferred`, `PauseUpdated`.

### `AgentEscrow`

State transitions: `Created -> EvidenceSubmitted -> VerificationPending -> Released|Refunded|Undetermined`; timeout paths end in `TimedOut -> Refunded`.

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(gatewayRouter)` | deploy | Binds the escrow application to the Gateway router. |
| `createJob(worker, deadline, policyHash)` | external payable | Locks a nonzero bounty in the application contract and creates a job. |
| `submitEvidence(jobId, evidenceUri, evidenceHash)` | external | Worker-only evidence commitment. |
| `requestVerification(jobId, question, policy, expiry)` | external payable | Client-only Gateway request using an escrow-owned nonce and exact policy commitment. |
| `onGatewayResult(...)` | external callback | Gateway-only settlement: pass pays worker, fail refunds client, undetermined holds funds. |
| `markTimedOut(jobId)` | external | Client/worker timeout transition; cannot override a finalized or callback-pending Gateway result. |
| `refundTimedOut(jobId)` | external | Client refund after timeout or undetermined result. |
| `_pay(recipient, amount)` | internal | Reentrancy-locked native-token settlement. |

Events: `JobCreated`, `EvidenceSubmitted`, `VerificationRequested`, `JobResolved`.

### `LayerZeroGatewaySender`

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(...)` | deploy | Configures endpoint, owner, remote EID/receiver, and GenLayer target. |
| `onlyOwner` | modifier | Restricts route administration. |
| `setRouter(router)` | owner | Binds the only authorized dispatch caller. |
| `setRemote(eid, receiver)` | owner | Rotates hub route. |
| `setTargetGenLayerReceiver(receiver)` | owner | Rotates GenLayer destination identity. |
| `setOptions(newOptions)` | owner | Updates LayerZero execution options. |
| `transferOwnership(newOwner)` | owner | Transfers sender administration. |
| `quoteDispatch(payload)` | external view | Quotes the endpoint delivery fee. |
| `dispatch(payload)` | external payable | Router-only dispatch; generates explicit message ID and sends the bridge envelope. |

Events: `MessageSent`, `RemoteReceiverUpdated`, `TargetGenLayerReceiverUpdated`, `OwnershipTransferred`.

### `LayerZeroHubReceiver`

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(endpoint, owner)` | deploy | Binds endpoint and owner. |
| `onlyOwner` | modifier | Restricts administration. |
| `setTrustedSender(eid, sender)` | owner | Configures authenticated source sender. |
| `setRelayer(relayer, authorized)` | owner | Configures authorized relay accounts. |
| `transferOwnership(newOwner)` | owner | Transfers administration. |
| `allowInitializePath(origin)` | external view | LayerZero receiver path check. |
| `nextNonce(...)` | external pure | Returns unordered-delivery nonce behavior. |
| `lzReceive(...)` | external payable | Endpoint/trusted-sender authenticated delivery with GUID and message-ID replay protection; stores pending request. |
| `markRelayed(messageId)` | external | Authorized relay acknowledgement. |
| `getMessage(messageId)` | external view | Returns the stored hub request. |

Events: `MessageReceived`, `MessageRelayed`, `OwnershipTransferred`.

### `LayerZeroHubForwarder`

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(endpoint, owner)` | deploy | Binds endpoint and owner. |
| `onlyOwner` | modifier | Restricts administration. |
| `setRelayer(relayer, authorized)` | owner | Configures authorized result relays. |
| `setDestination(eid, receiver)` | owner | Configures Base result receiver. |
| `setTrustedGenLayerSender(sender)` | owner | Configures the claimed GenLayer source identity. |
| `transferOwnership(newOwner)` | owner | Transfers administration. |
| `quoteResult(destinationEid, message, options)` | external view | Quotes result delivery. |
| `forwardResult(...)` | external payable | Authorized relay forwarding with source checks, bound hub receipt/request ID, attested result fields, fee equality, and replay protection. |

Events: `ResultForwarded`, `OwnershipTransferred`, `TrustedGenLayerSenderUpdated`, `ResultAttestorUpdated`, `HubReceiverUpdated`, `TrustedOriginRouterUpdated`.

### `LayerZeroResultReceiver`

| Entry point | Visibility | Behavior |
| --- | --- | --- |
| `constructor(endpoint, owner, expectedGenLayerChainId)` | deploy | Binds endpoint, owner, and GenLayer identity. |
| `setRouter(router)` | owner | Configures destination Gateway router. |
| `setTrustedForwarder(eid, sender)` | owner | Configures authenticated hub forwarder. |
| `setTrustedGenLayerSender(sender)` | owner | Configures expected GenLayer sender identity. |
| `transferOwnership(newOwner)` | owner | Transfers administration. |
| `allowInitializePath(origin)` | external view | LayerZero receiver path check. |
| `nextNonce(...)` | external pure | Returns unordered-delivery nonce behavior. |
| `lzReceive(...)` | external payable | Authenticates endpoint/forwarder/source/destination/version and delivers the decoded result to `GatewayRouter`. |

Events: `OwnershipTransferred`, `RouterUpdated`, `TrustedForwarderUpdated`, `TrustedGenLayerSenderUpdated`.

### Interfaces, Mocks, and Deployment Contracts

- `IGatewayCallback.onGatewayResult(...)` defines application callbacks.
- `ITransportAdapter.quoteDispatch(...)` and `dispatch(...)` define transport abstraction.
- `LayerZeroTypes` defines endpoint and receiver ABI types.
- `MockTransportAdapter` supports fee changes, dispatch capture, and result delivery in tests.
- `MockLayerZeroEndpoint` supports fee changes, message capture, and receiver delivery in tests.
- Foundry deployment entry points: `DeployBaseSepolia.run`, `DeployHub.run`, `ConfigureBaseSepolia.run`, `ConfigureHub.run`, `TransferBaseOwnership.run`, and `TransferHubOwnership.run`.

## GenLayer Intelligent Contract

### `GatewayAdjudicator`

Storage: protocol owner, authorized submitter, expected Base router, request-to-result map, and request ordering array.

| Entry point | Type | Behavior |
| --- | --- | --- |
| `__init__(authorized_submitter, expected_origin_contract, protocol_owner)` | constructor | Validates and stores protocol identities. |
| `get_result(request_id)` | public view | Returns canonical stored result JSON. |
| `get_request_count()` | public view | Returns finalized request count. |
| `get_configuration()` | public view | Returns owner, submitter, and expected origin router. |
| `set_authorized_submitter(submitter)` | public write | Owner-only relay submitter rotation. |
| `transfer_ownership(new_owner)` | public write | Owner-only protocol ownership transfer. |
| `adjudicate(...)` | public write | Submitter-only request validation, canonical Base request-ID recomputation, evidence fetch/digest validation, LLM adjudication, validator re-evaluation, and final result storage. |

Nondeterministic/external calls:

- `gl.nondet.web.get(evidence_uri)` fetches committed HTTPS evidence.
- `gl.nondet.exec_prompt(..., response_format="json")` produces constrained verdict/reason output.
- `gl.vm.run_nondet_unsafe(evaluate, validate)` requires validators to rerun evaluation and agree on the substantive decision and fetched body hash.

Deterministic helper functions: `_validate_hex_digest`, `_validate_address`, `_keccak_hex`, `_abi_word`, `_address_word`, `_digest_word`, `_canonical_request_id`, and `_normalize_analysis`.

## API Routes

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/api/v1/config` | Returns public Base contract/transport configuration. |
| `GET` | `/api/v1/health` | Pings MongoDB and returns service latency/status. |
| `GET`, `POST` | `/api/v1/reconcile` | Bearer-secret protected bounded reconciliation invocation. |
| `POST` | `/api/v1/requests` | Validates schema/expiry, proves successful Base receipt and `RequestDispatched`, optionally verifies EIP-712, reserves nonce, and creates lifecycle record. |
| `GET` | `/api/v1/requests/[requestId]` | Returns indexed request/lifecycle/result record. |
| `GET` | `/api/v1/requests/[requestId]/result` | Returns finalized result or `409`. |
| `POST` | `/api/v1/requests/[requestId]/retry` | Permissionlessly schedules immediate retry for non-complete requests. |
| `POST` | `/api/v1/webhooks/github` | HMAC-authenticated GitHub webhook receiver with size, JSON, header, and duplicate-delivery checks. |
| `GET` | `/api/v1/evidence/[workId]` | Immutable phase-gate evidence fixture endpoint, including controlled unreachable and prompt-injection cases. |

There are no always-on workers. Reconciliation is invoked by Vercel Cron and GitHub Actions and executes within a bounded serverless request.

## Backend Services and Persistence

- MongoDB: `getDatabase`, `ensureIndexes`.
- Request repository: `createRequestRecord`, `getRequestRecord`, `transitionRequest`, `listReconciliationCandidates`, `scheduleRetry`, `requestImmediateRetry`, `persistFinalizedResult`, `updateBridgeState`.
- Lease manager: `withLease` creates short unique request leases with TTL cleanup.
- Base verification: `readOnchainRequest`, `verifyOnchainRegistration`.
- Optional EIP-712 verification: `verifyGatewayRequestSignature` and `gatewayRequestTypes`.
- Reconciliation: `reconcileRequests` reads hub/GenLayer/Base state and advances lifecycle monotonically.
- Relay validation: `sameHex`, `decodeAndValidateHubRequest`, `parseAndValidateGenLayerResult`, `encodeReturnMessage`, `reconcileBridgeRequest`.

MongoDB collections/indexes:

- `requests`: unique `requestId`, unique `idempotencyKey`, lifecycle scheduling indexes.
- `nonces`: unique requester/nonce pairs.
- `leases`: unique lease IDs with TTL expiration.
- `webhook_events`: unique GitHub delivery IDs.

## Events, Listeners, Webhooks, and Notifications

- On-chain event emitters are listed under each Solidity contract above.
- The API registration path decodes `RequestDispatched` from a successful Base receipt.
- The phase-gate runner decodes `JobCreated` and `RequestDispatched` and polls lifecycle/result APIs.
- Reconciliation reads on-chain request state rather than treating MongoDB as verdict authority.
- GitHub webhook reception persists delivery metadata; no downstream notification emitter is implemented in v0.1.0.
- No email, push, Discord, Slack, or SMS notification integration exists.
- No separate indexing daemon exists; API registration plus bounded reconciliation provide indexing.

## UI and Wallet Paths

`GatewayConsole` uses an injected EIP-1193 wallet and `viem`:

1. Requests `wallet_switchEthereumChain` for Base Sepolia (`84532`).
2. Requests the selected address.
3. Client calls `AgentEscrow.createJob` with bounty, worker, deadline, and policy hash.
4. Worker calls `AgentEscrow.submitEvidence` with HTTPS URI and digest.
5. Client calls `AgentEscrow.requestVerification` with exact `0.001 ETH`.
6. Client reads `GatewayRouter.requests` and registers the successful transaction with the API.
7. UI polls the request endpoint and can invoke permissionless retry.

The client never signs a GenLayer transaction and never submits a verdict.

## External Integrations

| Integration | Use |
| --- | --- |
| Base Sepolia JSON-RPC | Origin contract reads/writes and receipt verification. |
| LayerZero-compatible endpoint contracts | Request and result message transport. |
| GenLayer Bradbury-compatible RPC via `genlayer-js` | Adjudicator deployment, writes, transaction status, result reads. |
| GenLayer validator web access | Fetches committed evidence. |
| GenLayer LLM execution | Produces constrained work verdict. |
| MongoDB | Operational lifecycle/index state. |
| Vercel | Next.js hosting, serverless API, scheduled reconcile trigger. |
| GitHub Actions | CI and secondary scheduled reconciliation trigger. |
| GitHub Webhooks | Authenticated event ingestion only. |

## Operational Scripts

- Deploy/configure: `deploy-base.sh`, `deploy-hub.sh`, `deploy-genlayer.sh`, `configure-base.sh`, `configure-hub.sh`.
- Ownership: `transfer-base-ownership.sh`, `transfer-hub-ownership.sh`.
- Validation: `validate-deployment-env.mjs`, `verify-live-deployment.mjs`.
- Gate: `run-testnet-phase-gate.mjs` executes 20 live jobs and requires at least 17 finalized and correct settlements.

## Configuration Surface

Public configuration includes Base Sepolia RPC, router, escrow, transport label, and exact request fee. Server-only configuration includes MongoDB, reconcile/webhook secrets, hub and GenLayer private keys, RPCs, endpoint/receiver addresses, EIDs, LayerZero options, deployer keys, relayer/submitter/owner addresses, and deployment manifest values.

## Explicitly Absent in v0.1.0

- No VPS or persistent worker.
- No Gateway custody of escrowed application funds.
- No backend-created verdict path.
- No production Hyperlane route.
- No cryptographic GenLayer-finality proof verified on Base.
- No live-mainnet support.
- No appeal mechanism.
- No user notification delivery service.
