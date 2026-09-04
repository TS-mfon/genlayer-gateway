import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { humanStatus, type GatewayJob } from "@/lib/jobs";
import { StatusBadge } from "./status-badge";

export function JobCard({ job }: { job: GatewayJob }) {
  return <article className="job-card">
    <div className="job-card-top"><StatusBadge status={job.status} /><span className="job-chain">{job.chain}</span></div>
    <h3>{job.title}</h3><p>{job.description || "No description provided."}</p>
    <div className="job-card-meta"><span><small>Bounty</small><strong>{job.bountyEth} ETH</strong></span><span><small>Worker</small><code>{job.worker ? `${job.worker.slice(0, 6)}…${job.worker.slice(-4)}` : "Unassigned"}</code></span></div>
    <Link className="text-link" href={`/jobs/${job.id}`}>Open job <ArrowUpRight size={15} /></Link>
  </article>;
}
