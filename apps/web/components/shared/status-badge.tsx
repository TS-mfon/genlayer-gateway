import { humanStatus, type JobStatus } from "@/lib/jobs";

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`} aria-label={`Status: ${humanStatus(status)}`}><span aria-hidden="true" />{humanStatus(status)}</span>;
}
