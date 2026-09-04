import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus, type Hash } from "genlayer-js/types";
import {
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_ROUTE_ID, GenLayerStoredResultSchema, type GatewayRequestRecord } from "@gateway/protocol";
import { getServerEnv, publicConfig } from "@/lib/env";
import {
  getRequestRecord,
  persistFinalizedResult,
  transitionRequest,
  updateBridgeState,
} from "@/lib/db/requests";
import { configuredRoutes, hasRelayExecutor, type GatewayRoute } from "@/lib/routes";

const hubReceiverAbi = [
  {
    type: "function",
    name: "getMessage",
    stateMutability: "view",
    inputs: [{ name: "messageId", type: "bytes32" }],
    outputs: [{
      name: "pending",
      type: "tuple",
      components: [
        { name: "sourceChainId", type: "uint32" },
        { name: "sourceSender", type: "address" },
        { name: "targetGenLayerContract", type: "address" },
        { name: "data", type: "bytes" },
        { name: "relayed", type: "bool" },
      ],
    }],
  },
  { type: "function", name: "markRelayed", stateMutability: "nonpayable", inputs: [{ name: "messageId", type: "bytes32" }], outputs: [] },
] as const;

const hubForwarderAbi = [
  { type: "function", name: "quoteResult", stateMutability: "view", inputs: [{ name: "destinationEid", type: "uint32" }, { name: "message", type: "bytes" }, { name: "options", type: "bytes" }], outputs: [{ name: "nativeFee", type: "uint256" }] },
  { type: "function", name: "forwardResult", stateMutability: "payable", inputs: [{ name: "resultTxHash", type: "bytes32" }, { name: "destinationEid", type: "uint32" }, { name: "message", type: "bytes" }, { name: "options", type: "bytes" }, { name: "attestation", type: "bytes" }], outputs: [{ name: "endpointGuid", type: "bytes32" }] },
  { type: "function", name: "getResultAttestationDigest", stateMutability: "view", inputs: [{ name: "resultTxHash", type: "bytes32" }, { name: "requestId", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "originMessageId", type: "bytes32" }, { name: "destinationEid", type: "uint32" }, { name: "messageHash", type: "bytes32" }], outputs: [{ name: "digest", type: "bytes32" }] },
  { type: "function", name: "signerEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "epoch", type: "uint64" }] },
  { type: "function", name: "usedResultTxHashes", stateMutability: "view", inputs: [{ name: "resultTxHash", type: "bytes32" }], outputs: [{ name: "used", type: "bool" }] },
] as const;

const hubForwarderQuorumAbi = [
  { type: "function", name: "quoteResult", stateMutability: "view", inputs: [{ name: "destinationEid", type: "uint32" }, { name: "message", type: "bytes" }, { name: "options", type: "bytes" }], outputs: [{ name: "nativeFee", type: "uint256" }] },
  { type: "function", name: "forwardResult", stateMutability: "payable", inputs: [{ name: "resultTxHash", type: "bytes32" }, { name: "destinationEid", type: "uint32" }, { name: "message", type: "bytes" }, { name: "options", type: "bytes" }, { name: "attestations", type: "bytes[]" }], outputs: [{ name: "endpointGuid", type: "bytes32" }] },
  { type: "function", name: "getResultAttestationDigest", stateMutability: "view", inputs: [{ name: "resultTxHash", type: "bytes32" }, { name: "requestId", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "originMessageId", type: "bytes32" }, { name: "destinationEid", type: "uint32" }, { name: "messageHash", type: "bytes32" }], outputs: [{ name: "digest", type: "bytes32" }] },
  { type: "function", name: "signerEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "epoch", type: "uint64" }] },
  { type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{ name: "quorum", type: "uint8" }] },
  { type: "function", name: "authorizedSigners", stateMutability: "view", inputs: [{ name: "signer", type: "address" }], outputs: [{ name: "authorized", type: "bool" }] },
  { type: "function", name: "usedResultTxHashes", stateMutability: "view", inputs: [{ name: "resultTxHash", type: "bytes32" }], outputs: [{ name: "used", type: "bool" }] },
] as const;

const requestEnvelope = parseAbiParameters("uint8, bytes32, uint256, address, address, address, uint64, uint64, string, string, string, bytes32");
const resultEnvelope = parseAbiParameters("uint8, bytes32, uint8, bytes32, bytes32, bytes32, bytes32");
const bridgeEnvelope = parseAbiParameters("uint32, address, address, bytes");

export class NoResultFinalizedError extends Error {
  constructor(transactionHash: string) {
    super(`Finalized GenLayer transaction has no result: ${transactionHash}`);
    this.name = "NoResultFinalizedError";
  }
}

function configured() {
  const env = getServerEnv();
  const quorumConfigured = Boolean(
    env.HUB_QUORUM_FORWARDER_ADDRESS && env.RESULT_ATTESTOR_1_PRIVATE_KEY
      && env.RESULT_ATTESTOR_2_PRIVATE_KEY && env.RESULT_ATTESTOR_QUORUM,
  );
  return Boolean(
    env.HUB_RELAYER_PRIVATE_KEY && env.GENLAYER_SUBMITTER_PRIVATE_KEY
      && env.HUB_RPC_URL && env.HUB_CHAIN_ID
      && env.HUB_RECEIVER_ADDRESS && (env.HUB_QUORUM_FORWARDER_ADDRESS || env.HUB_FORWARDER_ADDRESS)
      && env.BASE_LAYERZERO_EID && env.LAYERZERO_OPTIONS
      && env.GENLAYER_RPC_URL && env.GENLAYER_GATEWAY_ADDRESS,
  ) && (quorumConfigured || Boolean(env.RESULT_ATTESTOR_PRIVATE_KEY));
}

export function sameHex(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function resolveRelayRoute(
  candidate: GatewayRequestRecord,
  genLayerGateway: string,
): GatewayRoute {
  const routeId = candidate.request.routeId ?? DEFAULT_ROUTE_ID;
  const route = configuredRoutes().find((configured) => configured.id === routeId);
  if (!route || route.status !== "ACTIVE") {
    throw new Error(`GenLayer route is not active: ${routeId}`);
  }
  if (!hasRelayExecutor(route) || !sameHex(route.destinationContract, genLayerGateway)) {
    throw new Error(`GenLayer route executor is not implemented: ${routeId}`);
  }
  return route;
}

type PendingHubMessage = {
  sourceChainId: number;
  sourceSender: string;
  targetGenLayerContract: string;
  data: `0x${string}`;
  relayed: boolean;
};

export function decodeAndValidateHubRequest(
  pending: PendingHubMessage,
  candidate: GatewayRequestRecord,
  gatewayRouter: string,
  genLayerGateway: string,
) {
  if (
    pending.sourceChainId !== 84532
      || !sameHex(pending.sourceSender, gatewayRouter)
      || !sameHex(pending.targetGenLayerContract, genLayerGateway)
  ) throw new Error("Hub message route mismatch");

  const decoded = decodeAbiParameters(requestEnvelope, pending.data);
  const [version, requestId, originChainId, originContract, requester, callback, nonce, expiry, question, policy, evidenceUri, evidenceHash] = decoded;
  const primaryEvidence = candidate.request.evidence.items[0];
  if (!primaryEvidence || candidate.request.evidence.items.length !== 1) {
    throw new Error("Gateway v1 requires exactly one evidence item");
  }
  if (
    version !== 1
      || !sameHex(requestId, candidate.requestId)
      || originChainId !== 84532n
      || !sameHex(originContract, gatewayRouter)
      || !sameHex(requester, candidate.request.requester)
      || !sameHex(callback, candidate.request.callback)
      || nonce.toString() !== candidate.request.nonce
      || Number(expiry) * 1_000 !== new Date(candidate.request.expiry).getTime()
      || question !== candidate.request.question
      || policy !== candidate.request.policy
      || evidenceUri !== primaryEvidence.uri
      || !sameHex(evidenceHash, primaryEvidence.digest)
  ) throw new Error("Hub request commitment mismatch");
  return {
    version,
    requestId,
    originChainId,
    originContract,
    requester,
    callback,
    nonce,
    expiry,
    question,
    policy,
    evidenceUri,
    evidenceHash,
    primaryEvidence,
  };
}

export function parseAndValidateGenLayerResult(
  rawResult: string,
  candidate: GatewayRequestRecord,
  gatewayRouter: string,
) {
  const primaryEvidence = candidate.request.evidence.items[0];
  if (!primaryEvidence || candidate.request.evidence.items.length !== 1) {
    throw new Error("Gateway v1 requires exactly one evidence item");
  }
  const result = GenLayerStoredResultSchema.parse(JSON.parse(rawResult));
  if (
    !sameHex(result.request_id, candidate.requestId)
      || !sameHex(result.evidence_hash, primaryEvidence.digest)
      || !sameHex(result.policy_hash, keccak256(toBytes(candidate.request.policy)))
      || result.origin_chain_id !== 84532
      || !sameHex(result.origin_contract, gatewayRouter)
      || !sameHex(result.requester, candidate.request.requester)
      || !sameHex(result.callback, candidate.request.callback)
      || result.nonce.toString() !== candidate.request.nonce
      || result.expiry * 1_000 !== new Date(candidate.request.expiry).getTime()
  ) throw new Error("GenLayer result commitment mismatch");
  return result;
}

export function encodeReturnMessage(
  version: number,
  requestId: `0x${string}`,
  result: ReturnType<typeof parseAndValidateGenLayerResult>,
  genlayerTransaction: `0x${string}`,
  genLayerGateway: `0x${string}`,
  gatewayRouter: `0x${string}`,
  originMessageId: `0x${string}`,
) {
  const decision = result.decision === "PASS" ? 1 : result.decision === "FAIL" ? 2 : 3;
  const inner = encodeAbiParameters(resultEnvelope, [
    version,
    requestId,
    decision,
    result.evidence_hash as Hex,
    result.policy_hash as Hex,
    genlayerTransaction,
    originMessageId,
  ]);
  return encodeAbiParameters(bridgeEnvelope, [4221, genLayerGateway, gatewayRouter, inner]);
}

export async function createResultAttestation(
  attestorPrivateKey: `0x${string}`,
  digest: `0x${string}`,
) {
  const attestor = privateKeyToAccount(attestorPrivateKey);
  return attestor.sign({ hash: digest });
}

async function createResultAttestations(
  env: ReturnType<typeof getServerEnv>,
  publicClient: ReturnType<typeof createPublicClient>,
  forwarder: `0x${string}`,
  digest: `0x${string}`,
) {
  const keys = [env.RESULT_ATTESTOR_1_PRIVATE_KEY, env.RESULT_ATTESTOR_2_PRIVATE_KEY, env.RESULT_ATTESTOR_3_PRIVATE_KEY]
    .filter((key): key is string => Boolean(key));
  const quorum = Number(await publicClient.readContract({
    address: forwarder,
    abi: hubForwarderQuorumAbi,
    functionName: "quorum",
  }));
  if (keys.length < quorum) throw new Error(`Configured quorum requires ${quorum} attestor keys`);
  const signerAttestations = await Promise.all(keys.slice(0, quorum).map(async (key) => ({
    account: privateKeyToAccount(key as `0x${string}`),
    signature: await createResultAttestation(key as `0x${string}`, digest),
  })));
  const recovered = await Promise.all(signerAttestations.map(async ({ account }) => {
    const authorized = await publicClient.readContract({ address: forwarder, abi: hubForwarderQuorumAbi, functionName: "authorizedSigners", args: [account.address] });
    if (!authorized) throw new Error(`Attestor ${account.address} is not authorized by the quorum forwarder`);
    return account.address;
  }));
  if (new Set(recovered.map((address) => address.toLowerCase())).size !== recovered.length) throw new Error("Duplicate quorum attestor keys configured");
  return signerAttestations.map(({ signature }) => signature);
}

async function advanceToAdjudicating(requestId: string, messageId: string, transactionHash: string) {
  let latest = await getRequestRecord(requestId);
  if (!latest) throw new Error(`Unknown request ${requestId}`);
  if (latest.status === "FAILED" || latest.status === "TIMED_OUT") {
    latest = await transitionRequest(requestId, "DISPATCHED", "Reconciliation retry resumed");
  }
  if (latest?.status === "DISPATCHED") {
    latest = await transitionRequest(requestId, "DELIVERED", "Official bridge hub delivered the request", { messageId });
  }
  if (latest?.status === "DELIVERED") {
    await transitionRequest(requestId, "ADJUDICATING", "GenLayer transaction submitted", { transactionHash });
  }
}

async function advanceToFinalized(requestId: string, messageId: string, transactionHash: string) {
  await advanceToAdjudicating(requestId, messageId, transactionHash);
  const latest = await getRequestRecord(requestId);
  if (latest?.status === "ADJUDICATING") {
    await transitionRequest(requestId, "FINALIZED", "GenLayer consensus finalized", { transactionHash });
  }
}

export async function reconcileBridgeRequest(candidate: GatewayRequestRecord) {
  if (!configured()) return "bridge-disabled";
  const env = getServerEnv();
  const config = publicConfig();
  if (!config.gatewayRouter) return "router-unconfigured";
  const route = resolveRelayRoute(candidate, env.GENLAYER_GATEWAY_ADDRESS!);

  const hubChain = defineChain({
    id: env.HUB_CHAIN_ID!,
    name: "Gateway bridge hub",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.HUB_RPC_URL!] } },
  });
  const evmAccount = privateKeyToAccount(env.HUB_RELAYER_PRIVATE_KEY! as `0x${string}`);
  const hubPublic = createPublicClient({ chain: hubChain, transport: http(env.HUB_RPC_URL!) });
  const hubWallet = createWalletClient({ chain: hubChain, transport: http(env.HUB_RPC_URL!), account: evmAccount });
  const genlayerAccount = createAccount(env.GENLAYER_SUBMITTER_PRIVATE_KEY! as `0x${string}`);
  const genlayer = createClient({
    chain: {
      ...testnetBradbury,
      rpcUrls: { default: { http: [env.GENLAYER_RPC_URL!] } },
    },
    account: genlayerAccount,
  });

  const messageId = candidate.lifecycle.find((event) => event.messageId)?.messageId
    ?? candidate.bridge?.inboundMessageId;
  const inboundMessageId = messageId ?? (await getRequestRecord(candidate.requestId))?.bridge?.inboundMessageId;
  if (!inboundMessageId) return "awaiting-message-id";
  const effectiveMessageId = inboundMessageId;
  const pending = await hubPublic.readContract({
    address: env.HUB_RECEIVER_ADDRESS! as `0x${string}`,
    abi: hubReceiverAbi,
    functionName: "getMessage",
    args: [effectiveMessageId as `0x${string}`],
  });
  if (pending.sourceSender === "0x0000000000000000000000000000000000000000") return "awaiting-hub-delivery";
  const validated = decodeAndValidateHubRequest(
    pending,
    candidate,
    config.gatewayRouter,
    route.destinationContract,
  );
  const { version, requestId, originChainId, originContract, requester, callback, nonce, expiry, question, policy, evidenceUri, evidenceHash } = validated;

  let genlayerTransaction = candidate.bridge?.genlayerTransaction;
  if (candidate.status === "REQUIRES_REVIEW") {
    genlayerTransaction = await genlayer.writeContract({
      address: route.destinationContract as `0x${string}`,
      functionName: "adjudicate",
      args: [requestId, originChainId, originContract, requester, callback, nonce, expiry, question, policy, evidenceUri, evidenceHash, keccak256(toBytes(policy))],
      value: 0n,
    });
    if (!genlayerTransaction) throw new Error("GenLayer resubmission returned no transaction hash");
    await updateBridgeState(candidate.requestId, { inboundMessageId: effectiveMessageId, genlayerTransaction });
    await transitionRequest(candidate.requestId, "ADJUDICATING", "GenLayer adjudication resubmitted after finalized transaction had no result", { transactionHash: genlayerTransaction });
    return "genlayer-resubmitted";
  }
  if (!genlayerTransaction) {
    genlayerTransaction = await genlayer.writeContract({
      address: route.destinationContract as `0x${string}`,
      functionName: "adjudicate",
      args: [requestId, originChainId, originContract, requester, callback, nonce, expiry, question, policy, evidenceUri, evidenceHash, keccak256(toBytes(policy))],
      value: 0n,
    });
    if (!genlayerTransaction) throw new Error("GenLayer submission returned no transaction hash");
    await updateBridgeState(candidate.requestId, { inboundMessageId: effectiveMessageId, genlayerTransaction });
    if (!pending.relayed) {
      const markHash = await hubWallet.writeContract({
        address: env.HUB_RECEIVER_ADDRESS! as `0x${string}`,
        abi: hubReceiverAbi,
        functionName: "markRelayed",
        args: [effectiveMessageId as `0x${string}`],
      });
      await hubPublic.waitForTransactionReceipt({ hash: markHash });
    }
    await advanceToAdjudicating(candidate.requestId, effectiveMessageId, genlayerTransaction);
    return "genlayer-submitted";
  }

  const transaction = await genlayer.getTransaction({ hash: genlayerTransaction as Hash });
  if (transaction.statusName !== TransactionStatus.FINALIZED) return `genlayer:${transaction.statusName ?? "pending"}`;
  if (transaction.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(`GenLayer execution failed: ${transaction.txExecutionResultName ?? "unknown"}`);
  }
  const rawResult = await genlayer.readContract({
    address: route.destinationContract as `0x${string}`,
    functionName: "get_result",
    args: [candidate.requestId],
  });
  if (typeof rawResult !== "string" || rawResult.length === 0) throw new NoResultFinalizedError(genlayerTransaction);
  const result = parseAndValidateGenLayerResult(rawResult, candidate, config.gatewayRouter);
  await advanceToFinalized(candidate.requestId, effectiveMessageId, genlayerTransaction);
  await persistFinalizedResult(candidate.requestId, {
    requestId: candidate.requestId,
    decision: result.decision,
    reason: result.reason,
    evidenceHash: result.evidence_hash,
    policyHash: result.policy_hash,
    originChainId: 84532,
    originContract: candidate.request.originContract,
    genlayerTransaction,
    transportMessageId: effectiveMessageId,
    finalizedAt: new Date().toISOString(),
  });
  const latestBridgeState = await getRequestRecord(candidate.requestId);
  if (latestBridgeState?.bridge?.returnTransaction) {
    if (latestBridgeState.status === "FINALIZED") {
      await transitionRequest(candidate.requestId, "RETURN_DISPATCHED", "Bridge hub dispatched the finalized result", { transactionHash: latestBridgeState.bridge.returnTransaction });
    }
    return "awaiting-base-delivery";
  }
  const quorumForwarder = env.HUB_QUORUM_FORWARDER_ADDRESS as `0x${string}` | undefined;
  const activeForwarder = quorumForwarder ?? env.HUB_FORWARDER_ADDRESS! as `0x${string}`;
  const activeAbi = quorumForwarder ? hubForwarderQuorumAbi : hubForwarderAbi;
  const alreadyForwarded = await hubPublic.readContract({
    address: activeForwarder,
    abi: activeAbi,
    functionName: "usedResultTxHashes",
    args: [genlayerTransaction as `0x${string}`],
  });
  if (alreadyForwarded) return "return-already-forwarded";
  const outer = encodeReturnMessage(
    version,
    requestId,
    result,
    genlayerTransaction as `0x${string}`,
    route.destinationContract as `0x${string}`,
    config.gatewayRouter as `0x${string}`,
    effectiveMessageId as `0x${string}`,
  );
  const [, resultRequestId, resultDecision, resultEvidenceHash, resultPolicyHash, resultTx, originMessageId] = decodeAbiParameters(resultEnvelope, decodeAbiParameters(bridgeEnvelope, outer)[3]);
  const attestationDigest = await hubPublic.readContract({
    address: activeForwarder,
    abi: activeAbi,
    functionName: "getResultAttestationDigest",
    args: [resultTx, resultRequestId, resultDecision, resultEvidenceHash, resultPolicyHash, originMessageId, env.BASE_LAYERZERO_EID!, keccak256(toBytes(outer))],
  });
  const attestations = quorumForwarder
    ? await createResultAttestations(env, hubPublic, quorumForwarder, attestationDigest)
    : env.RESULT_ATTESTOR_PRIVATE_KEY
      ? [await createResultAttestation(env.RESULT_ATTESTOR_PRIVATE_KEY as `0x${string}`, attestationDigest)]
      : (() => { throw new Error("Result attestor key is not configured"); })();
  const fee = await hubPublic.readContract({
    address: activeForwarder,
    abi: activeAbi,
    functionName: "quoteResult",
    args: [env.BASE_LAYERZERO_EID!, outer, env.LAYERZERO_OPTIONS! as `0x${string}`],
  });
  const returnTransaction = await hubWallet.writeContract({
    address: activeForwarder,
    abi: activeAbi,
    functionName: "forwardResult",
    args: [genlayerTransaction as `0x${string}`, env.BASE_LAYERZERO_EID!, outer, env.LAYERZERO_OPTIONS! as `0x${string}`, quorumForwarder ? attestations : attestations[0]!],
    value: fee,
  });
  await hubPublic.waitForTransactionReceipt({ hash: returnTransaction });
  await updateBridgeState(candidate.requestId, { inboundMessageId: effectiveMessageId, genlayerTransaction, returnTransaction });
  const latest = await getRequestRecord(candidate.requestId);
  if (latest?.status === "FINALIZED") await transitionRequest(candidate.requestId, "RETURN_DISPATCHED", "Bridge hub dispatched the finalized result", { transactionHash: returnTransaction });
  return "return-dispatched";
}
