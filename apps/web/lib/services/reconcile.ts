import {
  getRequestRecord,
  listReconciliationCandidates,
  scheduleRetry,
  transitionRequest,
  persistFinalizedResult,
} from "@/lib/db/requests";
import { withLease } from "@/lib/db/leases";
import { readOnchainRequest } from "@/lib/protocol/router";
import { NoResultFinalizedError, reconcileBridgeRequest } from "@/lib/services/bridge-relay";

const routerStatuses: Record<number, "DISPATCHED" | "FINALIZED" | "CALLBACK_PENDING" | "CALLBACK_EXECUTED"> = {
  1: "DISPATCHED",
  2: "FINALIZED",
  3: "CALLBACK_PENDING",
  4: "CALLBACK_EXECUTED",
};

const catchUpPaths = {
  DISPATCHED: ["DISPATCHED"],
  FINALIZED: ["DISPATCHED", "DELIVERED", "ADJUDICATING", "FINALIZED"],
  CALLBACK_PENDING: [
    "DISPATCHED",
    "DELIVERED",
    "ADJUDICATING",
    "FINALIZED",
    "RETURN_DISPATCHED",
    "RETURNED",
    "CALLBACK_PENDING",
  ],
  CALLBACK_EXECUTED: [
    "DISPATCHED",
    "DELIVERED",
    "ADJUDICATING",
    "FINALIZED",
    "RETURN_DISPATCHED",
    "RETURNED",
    "CALLBACK_PENDING",
    "CALLBACK_EXECUTED",
  ],
} as const;

const lifecycleRank: Record<string, number> = {
  CREATED: 0,
  DISPATCHED: 1,
  DELIVERED: 2,
  ADJUDICATING: 3,
  REQUIRES_REVIEW: 3,
  FINALIZED: 4,
  RETURN_DISPATCHED: 5,
  RETURNED: 6,
  CALLBACK_PENDING: 7,
  CALLBACK_EXECUTED: 8,
};

function decodeDecision(value: number): "PASS" | "FAIL" | "UNDETERMINED" {
  if (value === 1) return "PASS";
  if (value === 2) return "FAIL";
  return "UNDETERMINED";
}

export async function reconcileRequests(limit = 25) {
  const candidates = await listReconciliationCandidates(limit);
  const outcomes: Array<{ requestId: string; outcome: string }> = [];

  for (const candidate of candidates) {
    const outcome = await withLease(`request:${candidate.requestId}`, 45_000, async () => {
      try {
        const bridgeOutcome = await reconcileBridgeRequest(candidate);
        const onchain = await readOnchainRequest(candidate.requestId);
        if (!onchain || onchain.requester === "0x0000000000000000000000000000000000000000") {
          return "not-onchain";
        }
        const target = routerStatuses[onchain.status];
        if (target && (lifecycleRank[target] ?? -1) > (lifecycleRank[candidate.status] ?? -1)) {
          const path = catchUpPaths[target];
          const currentIndex = path.findIndex((status) => status === candidate.status);
          const remainingPath = currentIndex >= 0 ? path.slice(currentIndex + 1) : path;
          for (const status of remainingPath) {
            const latest = await getRequestRecord(candidate.requestId);
            if (!latest || latest.status === status) continue;
            await transitionRequest(candidate.requestId, status, "Reconciled from Base Sepolia", {
              messageId: onchain.outboundMessageId,
            });
          }
        }
        if (onchain.status >= 2 && onchain.decision >= 1 && onchain.decision <= 3) {
          const latest = await getRequestRecord(candidate.requestId);
          if (latest && !latest.result) {
            await persistFinalizedResult(candidate.requestId, {
              requestId: candidate.requestId,
              decision: decodeDecision(onchain.decision),
              reason: "Finalized by GenLayer consensus; inspect the referenced transaction for authoritative reasoning.",
              evidenceHash: onchain.evidenceHash,
              policyHash: onchain.policyHash,
              originChainId: 84532,
              originContract: onchain.originContract,
              genlayerTransaction: onchain.resultTxHash,
              transportMessageId: onchain.outboundMessageId,
              finalizedAt: new Date().toISOString(),
            });
          }
        }
        return target ?? bridgeOutcome ?? "unknown-router-status";
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown reconciliation error";
        if (error instanceof NoResultFinalizedError) {
          const latest = await getRequestRecord(candidate.requestId);
          if (latest?.status === "ADJUDICATING") {
            await transitionRequest(candidate.requestId, "REQUIRES_REVIEW", reason);
          }
          await scheduleRetry(candidate.requestId, candidate.attempts, reason);
          return "requires-review";
        }
        await scheduleRetry(candidate.requestId, candidate.attempts, reason);
        return `retry:${reason}`;
      }
    });
    outcomes.push({ requestId: candidate.requestId, outcome: outcome ?? "lease-busy" });
  }

  return { inspected: candidates.length, outcomes };
}
