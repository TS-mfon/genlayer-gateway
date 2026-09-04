import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = [
  "BASE_SEPOLIA_RPC_URL",
  "BASE_LAYERZERO_ENDPOINT",
  "GATEWAY_API_URL",
  "RECONCILE_SECRET",
  "NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS",
  "NEXT_PUBLIC_AGENT_ESCROW_ADDRESS",
  "PHASE_GATE_CLIENT_PRIVATE_KEY",
  "HUB_RPC_URL",
  "HUB_CHAIN_ID",
  "HUB_QUORUM_FORWARDER_ADDRESS",
  "RESUME_REQUEST_ID",
  "RESUME_JOB_ID",
  "RESUME_REQUEST_TX",
  "RESUME_MESSAGE_ID",
  "RESUME_OUTBOUND_GUID",
];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const apiBase = process.env.GATEWAY_API_URL.replace(/\/$/, "");
const requestId = process.env.RESUME_REQUEST_ID;
const jobId = BigInt(process.env.RESUME_JOB_ID);
const pollMs = Number(process.env.PHASE_GATE_POLL_INTERVAL_MS ?? "30000");
const timeoutMs = Number(process.env.PHASE_GATE_REQUEST_TIMEOUT_MS ?? "10800000");

const baseChain = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.BASE_SEPOLIA_RPC_URL] } },
  testnet: true,
});
const hubChain = defineChain({
  id: Number(process.env.HUB_CHAIN_ID),
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.HUB_RPC_URL] } },
  testnet: true,
});
const basePublic = createPublicClient({ chain: baseChain, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });
const hubPublic = createPublicClient({ chain: hubChain, transport: http(process.env.HUB_RPC_URL) });
const activeForwarder = process.env.HUB_QUORUM_FORWARDER_ADDRESS;
const account = privateKeyToAccount(process.env.PHASE_GATE_CLIENT_PRIVATE_KEY);
const baseWallet = createWalletClient({ chain: baseChain, transport: http(process.env.BASE_SEPOLIA_RPC_URL), account });

const endpointAbi = [{
  type: "function",
  name: "lzReceive",
  stateMutability: "payable",
  inputs: [
    { name: "origin", type: "tuple", components: [{ name: "srcEid", type: "uint32" }, { name: "sender", type: "bytes32" }, { name: "nonce", type: "uint64" }] },
    { name: "receiver", type: "address" },
    { name: "guid", type: "bytes32" },
    { name: "message", type: "bytes" },
    { name: "extraData", type: "bytes" },
  ],
  outputs: [],
}];
const routerAbi = [{ type: "function", name: "requests", stateMutability: "view", inputs: [{ name: "requestId", type: "bytes32" }], outputs: [{ name: "requester", type: "address" }, { name: "originContract", type: "address" }, { name: "callback", type: "address" }, { name: "nonce", type: "uint64" }, { name: "expiry", type: "uint64" }, { name: "questionHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "outboundMessageId", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "status", type: "uint8" }, { name: "callbackLocked", type: "bool" }, { name: "resultTxHash", type: "bytes32" }] }];
const escrowAbi = [{ type: "function", name: "jobs", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "client", type: "address" }, { name: "worker", type: "address" }, { name: "bounty", type: "uint128" }, { name: "deadline", type: "uint64" }, { name: "status", type: "uint8" }, { name: "requestId", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "evidenceUri", type: "string" }] }];
const forwarderAbi = [{ type: "event", name: "ResultForwarded", anonymous: false, inputs: [{ name: "resultTxHash", type: "bytes32", indexed: true }, { name: "endpointGuid", type: "bytes32", indexed: true }, { name: "destinationEid", type: "uint32", indexed: false }] }];
const quorumAbi = [{ type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }];
const quorum = Number(await hubPublic.readContract({ address: activeForwarder, abi: quorumAbi, functionName: "quorum" }));
if (quorum < 2) throw new Error(`v0.2 quorum must be at least 2, got ${quorum}`);

async function retry(operation, attempts = 8) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await operation(); } catch (caught) {
      error = caught;
      if (attempt === attempts) throw caught;
      await sleep(attempt * 3_000);
    }
  }
  throw error;
}

async function reconcile() {
  const response = await retry(() => fetch(`${apiBase}/api/v1/reconcile`, { method: "POST", headers: { Authorization: `Bearer ${process.env.RECONCILE_SECRET}` } }));
  if (!response.ok) throw new Error(`Reconcile HTTP ${response.status}`);
}

async function getRecord() {
  const response = await retry(() => fetch(`${apiBase}/api/v1/requests/${requestId}`));
  if (!response.ok) throw new Error(`Request HTTP ${response.status}`);
  return response.json();
}

function toBytes32(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

async function retryReturn(returnTransaction) {
  const response = await retry(() => fetch(`https://scan-testnet.layerzero-api.com/v1/messages/tx/${returnTransaction}`));
  if (!response.ok) return null;
  const packet = (await response.json()).data?.[0];
  if (!packet?.source?.tx?.payload || packet.destination?.status === "SUCCEEDED") return null;
  const origin = { srcEid: Number(packet.pathway.srcEid), sender: toBytes32(packet.pathway.sender.address), nonce: BigInt(packet.pathway.nonce) };
  const args = [origin, packet.pathway.receiver.address, packet.guid, packet.source.tx.payload, "0x"];
  const simulation = await basePublic.simulateContract({ address: process.env.BASE_LAYERZERO_ENDPOINT, abi: endpointAbi, functionName: "lzReceive", args, account, gas: 1_500_000n });
  const hash = await baseWallet.writeContract({ ...simulation.request, gas: 1_500_000n });
  await basePublic.waitForTransactionReceipt({ hash, confirmations: 2 });
  return { hash, guid: packet.guid };
}

let record;
let returnRetry = null;
const startedAt = Date.now();
while (Date.now() - startedAt < timeoutMs) {
  await reconcile();
  record = await getRecord();
  console.log(`${new Date().toISOString()} ${record.status}`);
  if (record.status === "CALLBACK_EXECUTED" && record.result) break;
  if (record.status === "FAILED") throw new Error(`Request ${requestId} failed; inspect lifecycle and expiry before retrying`);
  if (record.status === "RETURN_DISPATCHED" && record.bridge?.returnTransaction) {
    try { returnRetry = await retryReturn(record.bridge.returnTransaction) ?? returnRetry; } catch {}
  }
  await sleep(pollMs);
}
if (!record?.result || record.status !== "CALLBACK_EXECUTED") throw new Error(`Timed out waiting for ${requestId}`);

const requestState = await retry(() => basePublic.readContract({ address: process.env.NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS, abi: routerAbi, functionName: "requests", args: [requestId] }));
const jobState = await retry(() => basePublic.readContract({ address: process.env.NEXT_PUBLIC_AGENT_ESCROW_ADDRESS, abi: escrowAbi, functionName: "jobs", args: [jobId] }));
let returnGuid = null;
if (record.bridge?.returnTransaction) {
  const receipt = await retry(() => hubPublic.getTransactionReceipt({ hash: record.bridge.returnTransaction }));
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: forwarderAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "ResultForwarded") returnGuid = decoded.args.endpointGuid;
    } catch {}
  }
}
  const expectedEscrowStatus = record.result.decision === "PASS" ? 4 : record.result.decision === "FAIL" ? 5 : 6;
const report = {
  generatedAt: new Date().toISOString(),
  mode: "smoke-resume",
  hubForwarder: activeForwarder,
  quorum,
  submitted: 1,
  finalized: 1,
  correct: Number(jobState[4]) === expectedEscrowStatus ? 1 : 0,
  required: 1,
  passed: Number(jobState[4]) === expectedEscrowStatus,
  results: [{
    workId: record.request.evidence.items[0]?.metadata?.workId ?? null,
    jobId: jobId.toString(),
    requestId,
    messageId: process.env.RESUME_MESSAGE_ID,
    outboundLayerZeroGuid: process.env.RESUME_OUTBOUND_GUID,
    returnLayerZeroGuid: returnGuid,
    returnRetryTransaction: returnRetry?.hash ?? null,
    expected: "PASS",
    actual: record.result.decision,
    status: record.status,
    settledCorrectly: Number(jobState[4]) === expectedEscrowStatus,
    escrowStatus: Number(jobState[4]),
    transactions: { requestTx: process.env.RESUME_REQUEST_TX, genlayerTransaction: record.result.genlayerTransaction, returnTransaction: record.bridge?.returnTransaction ?? null, resultTransaction: requestState[12] },
    lifecycle: record.lifecycle,
    bridge: record.bridge,
    result: record.result,
  }],
};
await mkdir(new URL("../phase-gate-results/", import.meta.url), { recursive: true });
const reportPath = new URL(`../phase-gate-results/${Date.now()}-smoke.json`, import.meta.url);
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, report: reportPath.pathname }, null, 2));
if (!report.passed) process.exitCode = 1;
