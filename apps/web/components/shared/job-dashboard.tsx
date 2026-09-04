"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { JOBS_UPDATED_EVENT, readJobs, type GatewayJob } from "@/lib/jobs";
import { JobCard } from "./job-card";

export function JobDashboard({ role }: { role: "client" | "worker" }) {
  const [jobs, setJobs] = useState<GatewayJob[]>([]);
  useEffect(() => { const refresh = () => setJobs(readJobs()); refresh(); window.addEventListener(JOBS_UPDATED_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(JOBS_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []);
  const visible = role === "client" ? jobs.filter((job) => job.client) : jobs.filter((job) => job.status !== "COMPLETED" && job.status !== "REFUNDED");
  const assigned = role === "worker" ? visible.filter((job) => job.status !== "OPEN") : [];
  const available = role === "worker" ? visible.filter((job) => job.status === "OPEN") : [];
  const title = role === "client" ? "Active Jobs Created" : "Assigned / Live Tasks";
  return <main className="app-page"><div className="page-heading"><div><span className="eyebrow">{role === "client" ? "CLIENT DASHBOARD" : "WORKER DASHBOARD"}</span><h1>{title}</h1><p>{role === "client" ? "Track funded work, evidence review, and settlement." : "Find live work and follow each task through submission."}</p></div><Link className="button primary" href={role === "client" ? "/create-job" : "#available-tasks"}>{role === "client" ? <><Plus size={17} /> Post a job</> : <><Search size={17} /> Browse tasks</>}</Link></div>{visible.length === 0 ? <section className="empty-state"><div className="empty-icon">{role === "client" ? <Plus /> : <Search />}</div><h2>{role === "client" ? "No jobs yet" : "No live tasks yet"}</h2><p>{role === "client" ? "Create your first funded task and it will appear here immediately." : "Open a job link from a client or create a test job to begin."}</p><Link className="button primary" href={role === "client" ? "/create-job" : "/test-console"}>{role === "client" ? "Create your first job" : "Open the guided test console"}</Link></section> : role === "worker" ? <div className="dashboard-sections"><section id="available-tasks"><div className="subheading"><h2>Available tasks</h2><span>{available.length}</span></div>{available.length ? <div className="job-grid">{available.map((job) => <JobCard key={job.id} job={job} />)}</div> : <p className="muted-copy">No unstarted tasks are visible yet.</p>}</section><section><div className="subheading"><h2>Assigned / live tasks</h2><span>{assigned.length}</span></div>{assigned.length ? <div className="job-grid">{assigned.map((job) => <JobCard key={job.id} job={job} />)}</div> : <p className="muted-copy">Your submitted work will appear here.</p>}</section></div> : <div className="job-grid">{visible.map((job) => <JobCard key={job.id} job={job} />)}</div>}</main>;
}
