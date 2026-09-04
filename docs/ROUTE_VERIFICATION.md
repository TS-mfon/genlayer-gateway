# Transport Route Verification

**Last checked:** August 29, 2026

## Implemented route

The repository now implements the GenLayer Foundation bridge pattern with a LayerZero-compatible transport:

```text
Base LayerZeroGatewaySender
→ LayerZero endpoint
→ LayerZeroHubReceiver
→ bounded authorized relay
→ GatewayAdjudicator on GenLayer
→ bounded authorized relay
→ LayerZeroHubForwarder
→ LayerZero endpoint
→ Base LayerZeroResultReceiver
→ GatewayRouter callback
```

The contracts authenticate configured LayerZero senders and reject malformed identities, commitment mismatches, duplicate GenLayer transaction hashes, duplicate LayerZero GUIDs, invalid decisions, and callback replays.

## What is not verified yet

- No contracts in this repository have testnet deployment addresses.
- No Base Sepolia → hub → GenLayer → hub → Base round-trip transaction has been recorded.
- No official Hyperlane ↔ GenLayer route is claimed.
- The authorized hub relayer can submit arbitrary return bytes to the forwarder. LayerZero authenticates the hub contract, not GenLayer consensus itself.
- Vercel Cron and GitHub Actions do not guarantee continuous relay liveness.

## Required functional-MVP gate

1. Deploy the hub contracts and record endpoint/EID values.
2. Deploy the Base sender, router, result receiver, and escrow.
3. Configure both LayerZero directions and executor options.
4. Deploy the GenLayer adjudicator with the relay and Base router constructor commitments.
5. Configure the deployed GenLayer address on the Base sender/result receiver.
6. Fund the Base/hub relay wallet and GenLayer submitter.
7. Complete one non-economic round trip and publish all transaction hashes.
8. Complete 20 escrow jobs on official testnets with at least 17 expected finalized outcomes.
9. Demonstrate wrong sender, wrong GenLayer identity, wrong commitment, duplicate GUID, duplicate result transaction, and callback replay failures.
10. Do not call the result path trust-minimized until Base verifies a GenLayer proof or an explicitly accepted decentralized security model replaces the unilateral relayer.
