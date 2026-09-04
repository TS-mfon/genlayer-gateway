import { createPublicClient, decodeEventLog, defineChain, getAddress, http, keccak256, toBytes } from "viem";
import type { CreateRequest } from "@gateway/protocol";
import { getServerEnv, publicConfig } from "@/lib/env";

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  testnet: true,
});

const requestAbi = [
  {
    type: "function",
    name: "requests",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: [
      { name: "requester", type: "address" },
      { name: "originContract", type: "address" },
      { name: "callback", type: "address" },
      { name: "nonce", type: "uint64" },
      { name: "expiry", type: "uint64" },
      { name: "questionHash", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "outboundMessageId", type: "bytes32" },
      { name: "decision", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "callbackLocked", type: "bool" },
      { name: "resultTxHash", type: "bytes32" },
    ],
  },
] as const;

export async function readOnchainRequest(requestId: string) {
  const config = publicConfig();
  if (!config.gatewayRouter) return null;
  const env = getServerEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) });
  const value = await client.readContract({
    address: config.gatewayRouter as `0x${string}`,
    abi: requestAbi,
    functionName: "requests",
    args: [requestId as `0x${string}`],
  });
  return {
    requester: value[0],
    originContract: value[1],
    callback: value[2],
    nonce: value[3],
    expiry: value[4],
    policyHash: value[6],
    evidenceHash: value[7],
    outboundMessageId: value[8],
    decision: Number(value[9]),
    status: Number(value[10]),
    resultTxHash: value[12],
  };
}

const requestDispatchedAbi = [{
  type: "event",
  name: "RequestDispatched",
  anonymous: false,
  inputs: [
    { name: "requestId", type: "bytes32", indexed: true },
    { name: "messageId", type: "bytes32", indexed: true },
    { name: "requester", type: "address", indexed: true },
    { name: "originContract", type: "address", indexed: false },
    { name: "callback", type: "address", indexed: false },
    { name: "questionHash", type: "bytes32", indexed: false },
    { name: "policyHash", type: "bytes32", indexed: false },
    { name: "evidenceHash", type: "bytes32", indexed: false },
  ],
}] as const;

export async function verifyOnchainRegistration(request: CreateRequest) {
  const config = publicConfig();
  if (!config.gatewayRouter) return false;
  const env = getServerEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(env.BASE_SEPOLIA_RPC_URL) });
  const receipt = await client.getTransactionReceipt({ hash: request.transactionHash as `0x${string}` });
  if (receipt.status !== "success") return false;
  const routerAddress = getAddress(config.gatewayRouter);
  const matchingLog = receipt.logs.find((log) => {
    if (getAddress(log.address) !== routerAddress) return false;
    try {
      const decoded = decodeEventLog({ abi: requestDispatchedAbi, data: log.data, topics: log.topics });
      return decoded.eventName === "RequestDispatched" && decoded.args.requestId.toLowerCase() === request.requestId.toLowerCase();
    } catch {
      return false;
    }
  });
  if (!matchingLog) return false;
  const decoded = decodeEventLog({ abi: requestDispatchedAbi, data: matchingLog.data, topics: matchingLog.topics });
  if (decoded.eventName !== "RequestDispatched") return false;
  const primaryEvidence = request.evidence.items[0];
  if (!primaryEvidence || request.evidence.items.length !== 1) return false;
  const onchain = await readOnchainRequest(request.requestId);
  if (!onchain) return false;
  return (
    decoded.args.requester.toLowerCase() === request.requester.toLowerCase()
    && decoded.args.originContract.toLowerCase() === request.originContract.toLowerCase()
    && decoded.args.callback.toLowerCase() === request.callback.toLowerCase()
    && decoded.args.questionHash.toLowerCase() === keccak256(toBytes(request.question)).toLowerCase()
    && decoded.args.policyHash.toLowerCase() === keccak256(toBytes(request.policy)).toLowerCase()
    && decoded.args.evidenceHash.toLowerCase() === primaryEvidence.digest.toLowerCase()
    && onchain.nonce.toString() === request.nonce
    && Number(onchain.expiry) * 1_000 === new Date(request.expiry).getTime()
  );
}
