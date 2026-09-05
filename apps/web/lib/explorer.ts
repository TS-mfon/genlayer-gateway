import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus, type Hash } from "genlayer-js/types";
import { GenLayerStoredResultSchema, type GatewayRequestRecord } from "@gateway/protocol";
import { getServerEnv, publicConfig } from "@/lib/env";
import { configuredRoutes } from "@/lib/routes";

export type DirectGenLayerRead = {
  source: "GENLAYER_DIRECT";
  contract: string;
  transactionHash?: string;
  transactionStatus?: string;
  executionStatus?: string;
  rawResult?: string;
  result?: ReturnType<typeof GenLayerStoredResultSchema.parse>;
  state: "FINALIZED" | "PENDING" | "UNAVAILABLE" | "NO_RESULT";
  error?: string;
};

export async function readDirectGenLayerResult(record: GatewayRequestRecord): Promise<DirectGenLayerRead> {
  const route = configuredRoutes().find((candidate) => candidate.id === (record.request.routeId ?? "gateway-adjudicator"));
  const env = getServerEnv();
  if (!route || !env.GENLAYER_RPC_URL) {
    return { source: "GENLAYER_DIRECT", contract: route?.destinationContract ?? "", state: "UNAVAILABLE", error: "Direct GenLayer reader is not configured." };
  }
  const client = createClient({
    chain: { ...testnetBradbury, rpcUrls: { default: { http: [env.GENLAYER_RPC_URL] } } },
  });
  try {
    const transactionHash = record.result?.genlayerTransaction ?? record.bridge?.genlayerTransaction;
    if (!transactionHash) return { source: "GENLAYER_DIRECT", contract: route.destinationContract, state: "PENDING" };
    const transaction = await client.getTransaction({ hash: transactionHash as Hash });
    if (transaction.statusName !== TransactionStatus.FINALIZED) {
      return { source: "GENLAYER_DIRECT", contract: route.destinationContract, transactionHash, transactionStatus: transaction.statusName, state: "PENDING" };
    }
    if (transaction.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      return { source: "GENLAYER_DIRECT", contract: route.destinationContract, transactionHash, transactionStatus: transaction.statusName, executionStatus: transaction.txExecutionResultName, state: "UNAVAILABLE", error: "GenLayer execution did not finish with a return value." };
    }
    const rawResult = await client.readContract({ address: route.destinationContract as `0x${string}`, functionName: "get_result", args: [record.requestId] });
    if (typeof rawResult !== "string" || rawResult.length === 0) {
      return { source: "GENLAYER_DIRECT", contract: route.destinationContract, transactionHash, transactionStatus: transaction.statusName, executionStatus: transaction.txExecutionResultName, state: "NO_RESULT" };
    }
    const result = GenLayerStoredResultSchema.parse(JSON.parse(rawResult));
    return { source: "GENLAYER_DIRECT", contract: route.destinationContract, transactionHash, transactionStatus: transaction.statusName, executionStatus: transaction.txExecutionResultName, rawResult, result, state: "FINALIZED" };
  } catch (error) {
    return { source: "GENLAYER_DIRECT", contract: route.destinationContract, state: "UNAVAILABLE", error: error instanceof Error ? error.message : "Direct GenLayer read failed." };
  }
}

export function compareIndexedAndDirect(record: GatewayRequestRecord, direct: DirectGenLayerRead) {
  if (!record.result || !direct.result) return { comparable: false, matches: null as boolean | null };
  return {
    comparable: true,
    matches: record.result.decision === direct.result.decision
      && record.result.evidenceHash.toLowerCase() === direct.result.evidence_hash.toLowerCase()
      && record.result.policyHash.toLowerCase() === direct.result.policy_hash.toLowerCase(),
  };
}

export function explorerConfig() {
  const config = publicConfig();
  return { ...config, destinationContract: configuredRoutes().find((route) => route.id === "gateway-adjudicator")?.destinationContract ?? null };
}
