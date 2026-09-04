export type JobStatus = "OPEN" | "CLAIMED" | "IN_REVIEW" | "COMPLETED" | "REFUNDED" | "REVIEW_REQUIRED";

export type GatewayJob = {
  id: string;
  title: string;
  description: string;
  policy: string;
  worker: string;
  client: string;
  bountyEth: string;
  evidenceUri: string;
  evidenceHash: string;
  status: JobStatus;
  chain: string;
  onChainJobId?: string;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
};

export const JOBS_STORAGE_KEY = "genlayer-gateway.jobs.v1";
export const JOBS_UPDATED_EVENT = "genlayer-gateway:jobs-updated";

const JOB_STATUSES: readonly JobStatus[] = ["OPEN", "CLAIMED", "IN_REVIEW", "COMPLETED", "REFUNDED", "REVIEW_REQUIRED"];

function isGatewayJob(value: unknown): value is GatewayJob {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GatewayJob>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.description === "string"
    && typeof candidate.policy === "string"
    && typeof candidate.worker === "string"
    && typeof candidate.client === "string"
    && typeof candidate.bountyEth === "string"
    && typeof candidate.evidenceUri === "string"
    && typeof candidate.evidenceHash === "string"
    && typeof candidate.chain === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && JOB_STATUSES.includes(candidate.status as JobStatus);
}

export function readJobs(): GatewayJob[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(JOBS_STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter(isGatewayJob) : [];
  } catch {
    return [];
  }
}

export function writeJobs(jobs: GatewayJob[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.filter(isGatewayJob)));
    window.dispatchEvent(new CustomEvent(JOBS_UPDATED_EVENT));
  } catch {
    return;
  }
}

export function upsertJob(job: GatewayJob) {
  const jobs = readJobs();
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index === -1) jobs.unshift(job);
  else jobs[index] = { ...jobs[index], ...job, updatedAt: new Date().toISOString() };
  writeJobs(jobs);
}

export function updateJob(id: string, patch: Partial<GatewayJob>) {
  const job = readJobs().find((item) => item.id === id);
  if (!job) return;
  upsertJob({ ...job, ...patch, updatedAt: new Date().toISOString() });
}

export function humanStatus(status: JobStatus) {
  return {
    OPEN: "Open",
    CLAIMED: "Claimed",
    IN_REVIEW: "In Review",
    COMPLETED: "Completed",
    REFUNDED: "Refunded",
    REVIEW_REQUIRED: "Review Required",
  }[status];
}
