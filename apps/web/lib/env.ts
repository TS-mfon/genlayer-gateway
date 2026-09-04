import { z } from "zod";

const ServerEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().default("genlayer_gateway"),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  RECONCILE_SECRET: z.string().min(24),
  CRON_SECRET: z.string().min(24).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(24).optional(),
  EVIDENCE_ALLOWED_DOMAINS: z.string().optional(),
  HUB_RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  GENLAYER_SUBMITTER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  RESULT_ATTESTOR_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  HUB_RPC_URL: z.string().url().optional(),
  HUB_CHAIN_ID: z.coerce.number().int().positive().optional(),
  HUB_LAYERZERO_EID: z.coerce.number().int().positive().optional(),
  HUB_RECEIVER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  HUB_FORWARDER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  HUB_QUORUM_FORWARDER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  RESULT_ATTESTOR_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  RESULT_ATTESTOR_1_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  RESULT_ATTESTOR_2_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  RESULT_ATTESTOR_3_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  RESULT_ATTESTOR_QUORUM: z.coerce.number().int().min(2).optional(),
  BASE_LAYERZERO_EID: z.coerce.number().int().positive().optional(),
  LAYERZERO_OPTIONS: z.string().regex(/^0x[0-9a-fA-F]*$/).optional(),
  GENLAYER_RPC_URL: z.string().url().optional(),
  GENLAYER_GATEWAY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  GENLAYER_ROUTES_JSON: z.string().max(128_000).optional(),
});

export function getServerEnv() {
  return ServerEnvSchema.parse(process.env);
}

export function publicConfig() {
  return {
    chainId: 84532,
    chainName: "Base Sepolia",
    baseRpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    gatewayRouter: process.env.NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS ?? null,
    agentEscrow: process.env.NEXT_PUBLIC_AGENT_ESCROW_ADDRESS ?? null,
    transport: process.env.NEXT_PUBLIC_TRANSPORT_NAME ?? "unconfigured",
    quorumForwarder: process.env.NEXT_PUBLIC_HUB_QUORUM_FORWARDER_ADDRESS ?? null,
    protocolOwner: process.env.NEXT_PUBLIC_PROTOCOL_OWNER ?? null,
    baseSender: process.env.NEXT_PUBLIC_BASE_SENDER_ADDRESS ?? null,
    baseResultReceiver: process.env.NEXT_PUBLIC_BASE_RESULT_RECEIVER_ADDRESS ?? null,
    hubReceiver: process.env.NEXT_PUBLIC_HUB_RECEIVER_ADDRESS ?? null,
    hubForwarder: process.env.NEXT_PUBLIC_HUB_QUORUM_FORWARDER_ADDRESS ?? process.env.NEXT_PUBLIC_HUB_FORWARDER_ADDRESS ?? null,
    hubChainId: Number(process.env.NEXT_PUBLIC_HUB_CHAIN_ID ?? 421614),
    hubEid: Number(process.env.NEXT_PUBLIC_HUB_LAYERZERO_EID ?? 40231),
    baseEid: Number(process.env.NEXT_PUBLIC_BASE_LAYERZERO_EID ?? 40245),
    requestFeeEth: "0.001",
    testnetOnly: true,
  } as const;
}
