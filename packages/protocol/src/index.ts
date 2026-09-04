import { z } from "zod";

export const REQUEST_FEE_WEI = 1_000_000_000_000_000n;
export const REQUEST_FEE_ETH = "0.001";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const MAX_QUESTION_BYTES = 4_096;
export const MAX_POLICY_BYTES = 8_192;
export const MAX_EVIDENCE_ITEMS = 12;
export const MAX_EVIDENCE_URI_BYTES = 1_024;
export const DEFAULT_ROUTE_ID = "gateway-adjudicator";

export const DecisionSchema = z.enum(["PASS", "FAIL", "UNDETERMINED"]);
export type Decision = z.infer<typeof DecisionSchema>;

export const RequestStatusSchema = z.enum([
  "CREATED",
  "DISPATCHED",
  "DELIVERED",
  "ADJUDICATING",
  "REQUIRES_REVIEW",
  "FINALIZED",
  "RETURN_DISPATCHED",
  "RETURNED",
  "CALLBACK_PENDING",
  "CALLBACK_EXECUTED",
  "FAILED",
  "TIMED_OUT",
]);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

export const EvidenceItemSchema = z.object({
  kind: z.enum(["GITHUB_COMMIT", "CONTENT_HASH", "TRANSACTION", "BLOCK", "URL"]),
  uri: z.string().min(1).max(MAX_EVIDENCE_URI_BYTES),
  digest: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  metadata: z.record(z.string().min(1).max(128), z.string().max(512)).default({})
    .refine((metadata) => Object.keys(metadata).length <= 16, "Evidence metadata has too many keys"),
});

export const EvidenceManifestSchema = z.object({
  version: z.literal("1"),
  items: z.array(EvidenceItemSchema).min(1).max(MAX_EVIDENCE_ITEMS),
});

export const CreateRequestSchema = z.object({
  routeId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
  requestId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  requester: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  originChainId: z.literal(BASE_SEPOLIA_CHAIN_ID),
  originContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  callback: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  question: z.string().min(1).max(MAX_QUESTION_BYTES),
  policy: z.string().min(1).max(MAX_POLICY_BYTES),
  evidence: EvidenceManifestSchema,
  nonce: z.string().regex(/^\d+$/),
  expiry: z.string().datetime(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).optional(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const GatewayResultSchema = z.object({
  requestId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  decision: DecisionSchema,
  reason: z.string().max(2_048),
  evidenceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  policyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  originChainId: z.number().int().positive(),
  originContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  genlayerTransaction: z.string(),
  transportMessageId: z.string(),
  finalizedAt: z.string().datetime(),
});

export const GenLayerStoredResultSchema = z.object({
  request_id: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  decision: DecisionSchema,
  reason: z.string().min(1).max(2_048),
  evidence_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  policy_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  origin_chain_id: z.number().int().positive(),
  origin_contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  requester: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  callback: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.number().int().nonnegative(),
  expiry: z.number().int().positive(),
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type GatewayResult = z.infer<typeof GatewayResultSchema>;
export type GenLayerStoredResult = z.infer<typeof GenLayerStoredResultSchema>;

export interface LifecycleEvent {
  status: RequestStatus;
  at: string;
  detail?: string;
  transactionHash?: string;
  messageId?: string;
}

export interface GatewayRequestRecord {
  requestId: string;
  idempotencyKey: string;
  request: CreateRequest;
  status: RequestStatus;
  lifecycle: LifecycleEvent[];
  result?: GatewayResult;
  bridge?: {
    inboundMessageId: string;
    genlayerTransaction?: string;
    returnTransaction?: string;
  };
  attempts: number;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const TERMINAL_STATUSES = new Set<RequestStatus>([
  "CALLBACK_EXECUTED",
  "FAILED",
  "TIMED_OUT",
]);

const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  CREATED: ["DISPATCHED", "FAILED", "TIMED_OUT"],
  DISPATCHED: ["DELIVERED", "FAILED", "TIMED_OUT"],
  DELIVERED: ["ADJUDICATING", "FAILED", "TIMED_OUT"],
  ADJUDICATING: ["REQUIRES_REVIEW", "FINALIZED", "FAILED", "TIMED_OUT"],
  REQUIRES_REVIEW: ["ADJUDICATING", "FAILED", "TIMED_OUT"],
  FINALIZED: ["RETURN_DISPATCHED", "FAILED"],
  RETURN_DISPATCHED: ["RETURNED", "FAILED", "TIMED_OUT"],
  RETURNED: ["CALLBACK_PENDING", "CALLBACK_EXECUTED", "FAILED"],
  CALLBACK_PENDING: ["CALLBACK_EXECUTED", "FAILED", "TIMED_OUT"],
  CALLBACK_EXECUTED: [],
  FAILED: ["DISPATCHED", "RETURN_DISPATCHED", "CALLBACK_PENDING"],
  TIMED_OUT: ["DISPATCHED", "RETURN_DISPATCHED", "CALLBACK_PENDING"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid Gateway lifecycle transition: ${from} -> ${to}`);
  }
}
