import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { createPublicClient, defineChain, getAddress, http } from "viem";

const required = [
  "BASE_SEPOLIA_RPC_URL",
  "BASE_SENDER_ADDRESS",
  "BASE_GATEWAY_ROUTER_ADDRESS",
  "BASE_RESULT_RECEIVER_ADDRESS",
  "AGENT_ESCROW_ADDRESS",
  "BASE_LAYERZERO_ENDPOINT",
  "BASE_LAYERZERO_EID",
  "HUB_RPC_URL",
  "HUB_CHAIN_ID",
  "HUB_RECEIVER_ADDRESS",
  "HUB_QUORUM_FORWARDER_ADDRESS",
  "HUB_LAYERZERO_ENDPOINT",
  "HUB_LAYERZERO_EID",
  "HUB_RELAYER_ADDRESS",
  "GENLAYER_RPC_URL",
  "GENLAYER_GATEWAY_ADDRESS",
  "GENLAYER_SUBMITTER_ADDRESS",
];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

const base = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.BASE_SEPOLIA_RPC_URL] } }, testnet: true });
const hub = defineChain({ id: Number(process.env.HUB_CHAIN_ID), name: "Gateway Hub", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.HUB_RPC_URL] } }, testnet: true });
const baseClient = createPublicClient({ chain: base, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });
const hubClient = createPublicClient({ chain: hub, transport: http(process.env.HUB_RPC_URL) });
const genlayer = createClient({ chain: { ...testnetBradbury, rpcUrls: { default: { http: [process.env.GENLAYER_RPC_URL] } } } });
const activeForwarder = process.env.HUB_QUORUM_FORWARDER_ADDRESS;
const asBytes32 = (address) => `0x${address.slice(2).padStart(64, "0")}`.toLowerCase();
const eq = (actual, expected, label) => {
  const normalizedActual = typeof actual === "string" ? actual.toLowerCase() : actual;
  const normalizedExpected = typeof expected === "string" ? expected.toLowerCase() : expected;
  if (normalizedActual !== normalizedExpected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const codeChecks = [
  [baseClient, process.env.BASE_SENDER_ADDRESS, "Base sender"],
  [baseClient, process.env.BASE_GATEWAY_ROUTER_ADDRESS, "Base router"],
  [baseClient, process.env.BASE_RESULT_RECEIVER_ADDRESS, "Base result receiver"],
  [baseClient, process.env.AGENT_ESCROW_ADDRESS, "Agent escrow"],
  [hubClient, process.env.HUB_RECEIVER_ADDRESS, "Hub receiver"],
  [hubClient, activeForwarder, "Hub quorum forwarder"],
];
for (const [client, address, label] of codeChecks) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no deployed bytecode`);
}

const senderAbi = [
  { type: "function", name: "endpoint", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "router", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "remoteEid", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "remoteReceiver", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "targetGenLayerReceiver", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "options", stateMutability: "view", inputs: [], outputs: [{ type: "bytes" }] },
];
const routerAbi = [
  { type: "function", name: "transport", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "resultReceiver", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const resultAbi = [
  { type: "function", name: "endpoint", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "router", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "trustedForwarders", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "trustedGenLayerSender", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const escrowAbi = [{ type: "function", name: "gateway", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const hubReceiverAbi = [
  { type: "function", name: "endpoint", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "trustedSenders", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "authorizedRelayers", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
];
const hubForwarderAbi = [
  { type: "function", name: "endpoint", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "destinationReceivers", stateMutability: "view", inputs: [{ type: "uint32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "authorizedRelayers", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "trustedGenLayerSender", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "trustedOriginRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "hubReceiver", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "signerEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "authorizedSigners", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
];

const read = (client, address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
eq(await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "endpoint"), getAddress(process.env.BASE_LAYERZERO_ENDPOINT), "sender endpoint");
eq(await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "router"), getAddress(process.env.BASE_GATEWAY_ROUTER_ADDRESS), "sender router");
eq(await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "remoteEid"), Number(process.env.HUB_LAYERZERO_EID), "sender hub EID");
eq(await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "remoteReceiver"), asBytes32(process.env.HUB_RECEIVER_ADDRESS), "sender hub receiver");
eq(await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "targetGenLayerReceiver"), getAddress(process.env.GENLAYER_GATEWAY_ADDRESS), "sender GenLayer target");
const options = await read(baseClient, process.env.BASE_SENDER_ADDRESS, senderAbi, "options");
eq(options, process.env.LAYERZERO_OPTIONS, "sender receive options");
eq(await read(baseClient, process.env.BASE_GATEWAY_ROUTER_ADDRESS, routerAbi, "transport"), getAddress(process.env.BASE_SENDER_ADDRESS), "router transport");
eq(await read(baseClient, process.env.BASE_GATEWAY_ROUTER_ADDRESS, routerAbi, "resultReceiver"), getAddress(process.env.BASE_RESULT_RECEIVER_ADDRESS), "router result receiver");
eq(await read(baseClient, process.env.BASE_RESULT_RECEIVER_ADDRESS, resultAbi, "endpoint"), getAddress(process.env.BASE_LAYERZERO_ENDPOINT), "result endpoint");
eq(await read(baseClient, process.env.BASE_RESULT_RECEIVER_ADDRESS, resultAbi, "router"), getAddress(process.env.BASE_GATEWAY_ROUTER_ADDRESS), "result router");
eq(await read(baseClient, process.env.BASE_RESULT_RECEIVER_ADDRESS, resultAbi, "trustedForwarders", [Number(process.env.HUB_LAYERZERO_EID)]), asBytes32(activeForwarder), "trusted hub quorum forwarder");
eq(await read(baseClient, process.env.BASE_RESULT_RECEIVER_ADDRESS, resultAbi, "trustedGenLayerSender"), getAddress(process.env.GENLAYER_GATEWAY_ADDRESS), "trusted GenLayer sender");
eq(await read(baseClient, process.env.AGENT_ESCROW_ADDRESS, escrowAbi, "gateway"), getAddress(process.env.BASE_GATEWAY_ROUTER_ADDRESS), "escrow gateway");
eq(await read(hubClient, process.env.HUB_RECEIVER_ADDRESS, hubReceiverAbi, "endpoint"), getAddress(process.env.HUB_LAYERZERO_ENDPOINT), "hub receiver endpoint");
eq(await read(hubClient, process.env.HUB_RECEIVER_ADDRESS, hubReceiverAbi, "trustedSenders", [Number(process.env.BASE_LAYERZERO_EID)]), asBytes32(process.env.BASE_SENDER_ADDRESS), "hub trusted sender");
eq(await read(hubClient, process.env.HUB_RECEIVER_ADDRESS, hubReceiverAbi, "authorizedRelayers", [process.env.HUB_RELAYER_ADDRESS]), true, "hub receiver relayer");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "endpoint"), getAddress(process.env.HUB_LAYERZERO_ENDPOINT), "hub forwarder endpoint");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "destinationReceivers", [Number(process.env.BASE_LAYERZERO_EID)]), asBytes32(process.env.BASE_RESULT_RECEIVER_ADDRESS), "hub destination receiver");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "authorizedRelayers", [process.env.HUB_RELAYER_ADDRESS]), true, "hub forwarder relayer");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "trustedGenLayerSender"), getAddress(process.env.GENLAYER_GATEWAY_ADDRESS), "hub trusted GenLayer sender");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "trustedOriginRouter"), getAddress(process.env.BASE_GATEWAY_ROUTER_ADDRESS), "hub trusted origin router");
eq(await read(hubClient, activeForwarder, hubForwarderAbi, "hubReceiver"), getAddress(process.env.HUB_RECEIVER_ADDRESS), "hub receiver binding");
const quorum = Number(await read(hubClient, activeForwarder, hubForwarderAbi, "quorum"));
if (quorum < 2) throw new Error(`hub quorum must be at least 2, got ${quorum}`);
const signerAddresses = [process.env.RESULT_ATTESTOR_1_ADDRESS, process.env.RESULT_ATTESTOR_2_ADDRESS, process.env.RESULT_ATTESTOR_3_ADDRESS].filter(Boolean);
for (const signer of signerAddresses) eq(await read(hubClient, activeForwarder, hubForwarderAbi, "authorizedSigners", [signer]), true, `authorized attestor ${signer}`);
const genlayerCode = await genlayer.getContractCode(process.env.GENLAYER_GATEWAY_ADDRESS);
if (!genlayerCode) throw new Error("GenLayer adjudicator has no deployed code");
const configuration = await genlayer.readContract({ address: process.env.GENLAYER_GATEWAY_ADDRESS, functionName: "get_configuration", args: [] });
const entries = configuration instanceof Map ? Object.fromEntries(configuration) : configuration;
eq(entries.authorized_submitter, process.env.GENLAYER_SUBMITTER_ADDRESS, "GenLayer submitter");
eq(entries.expected_origin_contract, process.env.BASE_GATEWAY_ROUTER_ADDRESS, "GenLayer origin router");
console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), activeForwarder, quorum, signerAddresses, contracts: required.filter((name) => name.endsWith("ADDRESS")).reduce((all, name) => ({ ...all, [name]: process.env[name] }), {}) }, null, 2));
