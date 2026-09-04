import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, defineChain, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const requiredEnv = [
  "BASE_SEPOLIA_RPC_URL", "BASE_LAYERZERO_ENDPOINT", "HUB_RPC_URL", "HUB_CHAIN_ID",
  "HUB_LAYERZERO_ENDPOINT", "HUB_RELAYER_PRIVATE_KEY", "GATEWAY_API_URL", "RECONCILE_SECRET",
  "NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS", "NEXT_PUBLIC_AGENT_ESCROW_ADDRESS", "PHASE_GATE_CLIENT_PRIVATE_KEY", "HUB_QUORUM_FORWARDER_ADDRESS",
];
for (const name of requiredEnv) if (!process.env[name]) throw new Error(`Missing ${name}`);

const historicalInitial = [
  ["job-01", "0x0f82f34bc9895dc468566f7ac876d1df60a0ce3f1cac25c56d685594b6f75114"],
  ["job-02", "0xaeeed9e356488c83ce6fc5d7b9ae6a15c0d1f658d4bc814afef7721bb2682667"],
  ["job-03", "0x798775e8b32ab87811e8c535cef23bc33888010cb0a344053c1d669da7c35464"],
  ["job-04", "0x46ca6797479c8ec510e3cab5e8a25ef2d74a7b15de31149e3bbee2d8f606528d"],
  ["job-05", "0xbc368ec3858c3c1fb4077b460ae9c13823c542b40095bd759bc1f3f094300fc1"],
  ["job-06", "0xc61fef91ef0f7a30a010cc7618088be066afd568b4ec9bc116c3492eb6b7d823"],
];
const initial = process.env.PHASE_GATE_SKIP_HISTORICAL === "true" ? [] : historicalInitial;
const checkpointFiles = (process.env.PHASE_GATE_CHECKPOINTS ?? "phase-gate-results/1788223506503-in-progress.json,phase-gate-results/1788224326641-in-progress.json").split(",").map((file) => file.trim()).filter(Boolean);
const jobs = JSON.parse(await readFile(new URL("../tests/jobs/work-submissions.json", import.meta.url), "utf8"));
const expected = new Map(jobs.map((job) => [job.id, job.expected]));
const entries = initial.map(([workId, requestId]) => ({ workId, requestId, expected: expected.get(workId) }));
for (const file of checkpointFiles) {
  const checkpoint = JSON.parse(await readFile(file, "utf8"));
  for (const item of checkpoint.submitted) {
    if (!entries.some((entry) => entry.workId === item.workId)) entries.push({ ...item });
  }
}
if (entries.length !== 20 || new Set(entries.map((entry) => entry.workId)).size !== 20) throw new Error("Aggregate manifest must contain 20 unique jobs");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const apiBase = process.env.GATEWAY_API_URL.replace(/\/$/, "");
const pollMs = Number(process.env.PHASE_GATE_POLL_INTERVAL_MS ?? "30000");
const timeoutMs = Number(process.env.PHASE_GATE_REQUEST_TIMEOUT_MS ?? "21600000");
const stopAt = Number(process.env.PHASE_GATE_STOP_AT ?? "20");
const baseChain = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.BASE_SEPOLIA_RPC_URL] } }, testnet: true });
const hubChain = defineChain({ id: Number(process.env.HUB_CHAIN_ID), name: "Arbitrum Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.HUB_RPC_URL] } }, testnet: true });
const baseTransports = [http(process.env.BASE_SEPOLIA_RPC_URL)];
if (process.env.BASE_SEPOLIA_FALLBACK_RPC_URL) baseTransports.push(http(process.env.BASE_SEPOLIA_FALLBACK_RPC_URL));
const baseTransport = baseTransports.length > 1 ? fallback(baseTransports, { retryCount: 2 }) : baseTransports[0];
const basePublic = createPublicClient({ chain: baseChain, transport: baseTransport });
const hubPublic = createPublicClient({ chain: hubChain, transport: http(process.env.HUB_RPC_URL) });
const baseAccount = privateKeyToAccount(process.env.PHASE_GATE_CLIENT_PRIVATE_KEY);
const hubAccount = privateKeyToAccount(process.env.HUB_RELAYER_PRIVATE_KEY);
const baseWallet = createWalletClient({ chain: baseChain, transport: baseTransport, account: baseAccount });
const hubWallet = createWalletClient({ chain: hubChain, transport: http(process.env.HUB_RPC_URL), account: hubAccount });
const activeForwarder = process.env.HUB_QUORUM_FORWARDER_ADDRESS;
const quorum = Number(await hubPublic.readContract({ address: activeForwarder, abi: [{ type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "quorum" }));
if (quorum < 2) throw new Error(`v0.2 quorum must be at least 2, got ${quorum}`);

const endpointAbi = [{ type: "function", name: "lzReceive", stateMutability: "payable", inputs: [{ name: "origin", type: "tuple", components: [{ name: "srcEid", type: "uint32" }, { name: "sender", type: "bytes32" }, { name: "nonce", type: "uint64" }] }, { name: "receiver", type: "address" }, { name: "guid", type: "bytes32" }, { name: "message", type: "bytes" }, { name: "extraData", type: "bytes" }], outputs: [] }];
const routerAbi = [{ type: "function", name: "requests", stateMutability: "view", inputs: [{ name: "requestId", type: "bytes32" }], outputs: [{ name: "requester", type: "address" }, { name: "originContract", type: "address" }, { name: "callback", type: "address" }, { name: "nonce", type: "uint64" }, { name: "expiry", type: "uint64" }, { name: "questionHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "outboundMessageId", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "status", type: "uint8" }, { name: "callbackLocked", type: "bool" }, { name: "resultTxHash", type: "bytes32" }] }];
const escrowAbi = [{ type: "function", name: "jobs", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "client", type: "address" }, { name: "worker", type: "address" }, { name: "bounty", type: "uint128" }, { name: "deadline", type: "uint64" }, { name: "status", type: "uint8" }, { name: "requestId", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "evidenceUri", type: "string" }] }];

async function retry(operation, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

async function fetchJson(url, init) {
  return retry(async () => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }, 12);
}

async function reconcile() {
  await fetchJson(`${apiBase}/api/v1/reconcile`, { method: "POST", headers: { Authorization: `Bearer ${process.env.RECONCILE_SECRET}` } });
}

function toBytes32(address) { return `0x${address.slice(2).padStart(64, "0")}`; }

async function packetFor(transactionHash) {
  const response = await retry(() => fetch(`https://scan-testnet.layerzero-api.com/v1/messages/tx/${transactionHash}`));
  if (!response.ok) return null;
  return (await response.json()).data?.[0] ?? null;
}

async function retryPacket(transactionHash, destinationClient, destinationWallet, endpoint) {
  const packet = await packetFor(transactionHash);
  if (!packet?.source?.tx?.payload || packet.destination?.status === "SUCCEEDED") return null;
  const origin = { srcEid: Number(packet.pathway.srcEid), sender: toBytes32(packet.pathway.sender.address), nonce: BigInt(packet.pathway.nonce) };
  const args = [origin, packet.pathway.receiver.address, packet.guid, packet.source.tx.payload, "0x"];
  const simulation = await destinationClient.simulateContract({ address: endpoint, abi: endpointAbi, functionName: "lzReceive", args, account: destinationWallet.account, gas: 1_500_000n });
  const hash = await destinationWallet.writeContract({ ...simulation.request, gas: 1_500_000n });
  await destinationClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return { hash, guid: packet.guid };
}

const records = new Map();
const retryTransactions = new Map();
const startedAt = Date.now();
while (Date.now() - startedAt < timeoutMs) {
  await reconcile();
  let complete = 0;
  for (const entry of entries) {
    const record = await fetchJson(`${apiBase}/api/v1/requests/${entry.requestId}`);
    records.set(entry.requestId, record);
    entry.jobId ??= record.request.evidence.items[0]?.metadata?.jobId;
    entry.messageId ??= record.lifecycle.find((event) => event.messageId)?.messageId;
    entry.transactions ??= {};
    entry.transactions.requestTx ??= record.request.transactionHash;
    if (record.status === "CALLBACK_EXECUTED" && record.result) { complete++; continue; }
    try {
      if (record.status === "DISPATCHED" && entry.transactions.requestTx) {
        const retried = await retryPacket(entry.transactions.requestTx, hubPublic, hubWallet, process.env.HUB_LAYERZERO_ENDPOINT);
        if (retried) retryTransactions.set(`${entry.requestId}:outbound`, retried.hash);
      }
      if (record.status === "RETURN_DISPATCHED" && record.bridge?.returnTransaction) {
        const retried = await retryPacket(record.bridge.returnTransaction, basePublic, baseWallet, process.env.BASE_LAYERZERO_ENDPOINT);
        if (retried) retryTransactions.set(`${entry.requestId}:return`, retried.hash);
      }
    } catch {}
  }
  console.log(`${new Date().toISOString()} callbackExecuted=${complete}/20`);
  if (complete >= stopAt) break;
  await sleep(pollMs);
}

const results = [];
for (const entry of entries.sort((left, right) => left.workId.localeCompare(right.workId))) {
  const record = records.get(entry.requestId) ?? await fetchJson(`${apiBase}/api/v1/requests/${entry.requestId}`);
  const result = record.result ?? null;
  let jobState = null;
  let requestState = null;
  if (entry.jobId) {
    jobState = await retry(() => basePublic.readContract({ address: process.env.NEXT_PUBLIC_AGENT_ESCROW_ADDRESS, abi: escrowAbi, functionName: "jobs", args: [BigInt(entry.jobId)] }));
    requestState = await retry(() => basePublic.readContract({ address: process.env.NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS, abi: routerAbi, functionName: "requests", args: [entry.requestId] }));
  }
  const expectedEscrowStatus = result?.decision === "PASS" ? 4 : result?.decision === "FAIL" ? 5 : result?.decision === "UNDETERMINED" ? 6 : null;
  const settledCorrectly = expectedEscrowStatus !== null && Number(jobState?.[4]) === expectedEscrowStatus;
  const outboundPacket = entry.transactions?.requestTx ? await packetFor(entry.transactions.requestTx).catch(() => null) : null;
  const returnPacket = record.bridge?.returnTransaction ? await packetFor(record.bridge.returnTransaction).catch(() => null) : null;
  results.push({
    workId: entry.workId,
    jobId: entry.jobId ?? null,
    requestId: entry.requestId,
    messageId: entry.messageId ?? record.bridge?.inboundMessageId ?? null,
    outboundLayerZeroGuid: entry.outboundLayerZeroGuid ?? outboundPacket?.guid ?? null,
    returnLayerZeroGuid: returnPacket?.guid ?? null,
    outboundRetryTransaction: retryTransactions.get(`${entry.requestId}:outbound`) ?? entry.outboundRetryTransaction ?? null,
    returnRetryTransaction: retryTransactions.get(`${entry.requestId}:return`) ?? null,
    expected: entry.expected,
    actual: result?.decision ?? null,
    status: record.status,
    matchesExpected: result?.decision === entry.expected,
    settledCorrectly,
    escrowStatus: jobState ? Number(jobState[4]) : null,
    transactions: { ...entry.transactions, genlayerTransaction: result?.genlayerTransaction ?? record.bridge?.genlayerTransaction ?? null, returnTransaction: record.bridge?.returnTransaction ?? null, resultTransaction: requestState?.[12] ?? null },
    lifecycle: record.lifecycle,
    bridge: record.bridge ?? null,
    result,
  });
}

const finalized = results.filter((result) => result.actual).length;
const correct = results.filter((result) => result.matchesExpected && result.settledCorrectly).length;
const report = { generatedAt: new Date().toISOString(), mode: "phase-gate-aggregate", chainId: 84532, hubForwarder: activeForwarder, quorum, submitted: 20, finalized, correct, required: 17, passed: finalized >= 17 && correct >= 17, results };
await mkdir(new URL("../phase-gate-results/", import.meta.url), { recursive: true });
const reportPath = new URL(`../phase-gate-results/${Date.now()}-aggregate.json`, import.meta.url);
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ finalized, correct, passed: report.passed, report: reportPath.pathname }, null, 2));
if (!report.passed) process.exitCode = 1;
