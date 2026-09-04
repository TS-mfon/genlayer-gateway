import { humanStatus, type JobStatus } from "@/lib/jobs";

const stages = [
  ["OPEN", "Created"],
  ["CLAIMED", "Claimed"],
  ["IN_REVIEW", "Review"],
  ["COMPLETED", "Paid"],
] as const;

export function ProgressRail({ status }: { status: JobStatus }) {
  const position = status === "REFUNDED" || status === "REVIEW_REQUIRED" ? 2 : stages.findIndex(([value]) => value === status);
  return <ol className="progress-rail" aria-label={`Job progress: ${humanStatus(status)}`}>
    {stages.map(([value, label], index) => <li key={value} className={index < position ? "complete" : index === position ? "current" : "inactive"} aria-current={index === position ? "step" : undefined}><span className="progress-node" aria-hidden="true">{index < position ? "✓" : index + 1}</span><strong>{label}</strong></li>)}
  </ol>;
}
