"use client";

import Link from "next/link";
import { Activity, ArrowRight, ExternalLink, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const statuses = ["", "CREATED", "DISPATCHED", "DELIVERED", "ADJUDICATING", "FINALIZED", "CALLBACK_EXECUTED", "FAILED", "TIMED_OUT"];
const labels: Record<string, string> = { CREATED: "Created", DISPATCHED: "Dispatched", DELIVERED: "Delivered", ADJUDICATING: "Adjudicating", FINALIZED: "Finalized", CALLBACK_EXECUTED: "Callback executed", FAILED: "Failed", TIMED_OUT: "Timed out" };
const decisions = ["", "PASS", "FAIL", "UNDETERMINED"];

type RequestRecord = { requestId: string; status: string; updatedAt: string; request: { routeId?: string; originChainId: number; originContract: string; evidence: { items: Array<{ uri: string; digest: string }> }; transactionHash: string }; result?: { decision: string; reason: string; genlayerTransaction: string }; bridge?: { inboundMessageId?: string; genlayerTransaction?: string; returnTransaction?: string } };

type Response = { requests: RequestRecord[]; count: number };

function short(value?: string) { return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—"; }
function statusLabel(value: string) { return labels[value] ?? value.replaceAll("_", " "); }

export function Explorer() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [decision, setDecision] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (decision) params.set("decision", decision);
      const response = await fetch(`/api/v1/requests?${params}`, { cache: "no-store" });
      const payload = await response.json() as Response & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Request index unavailable.");
      setRecords(payload.requests);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request index unavailable."); }
    finally { setLoading(false); }
  }, [decision, query, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const active = records.some((record) => !["CALLBACK_EXECUTED", "FAILED", "TIMED_OUT"].includes(record.status));
    if (!active) return;
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load, records]);

  return <main className="app-page explorer-page">
    <div className="page-heading">
      <div><span className="eyebrow">READ-ONLY PROTOCOL OBSERVATORY</span><h1>Inspect Gateway activity.</h1><p>Follow requests from the origin chain to the reviewed GenLayer contract and back. This surface never connects a wallet or submits a transaction.</p></div>
      <div className="explorer-heading-actions"><span className="network-pill">Base Sepolia · Bradbury</span><button className="button secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button></div>
    </div>
    <section className="explorer-search" aria-label="Request filters">
      <label className="explorer-search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Search request, transaction, message ID, or evidence URL" /></label>
      <select aria-label="Filter by lifecycle status" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value ? statusLabel(value) : "All lifecycle states"}</option>)}</select>
      <select aria-label="Filter by decision" value={decision} onChange={(event) => setDecision(event.target.value)}>{decisions.map((value) => <option key={value} value={value}>{value || "All decisions"}</option>)}</select>
    </section>
    <div className="explorer-source-note"><Activity size={16} /><span>Showing indexed Gateway records. Open a request to compare them with a direct GenLayer contract read.</span><Link href="/docs/explorer">How to read this data <ArrowRight size={14} /></Link></div>
    {error ? <section className="empty-state"><ShieldAlert className="empty-icon" /><h2>Explorer unavailable</h2><p>{error}</p><button className="button secondary" onClick={() => void load()}>Try again</button></section> : loading && records.length === 0 ? <section className="empty-state"><p>Loading Gateway activity…</p></section> : records.length === 0 ? <section className="empty-state"><Search className="empty-icon" /><h2>No matching requests</h2><p>Try a different identifier or clear the filters.</p></section> : <section className="explorer-table-wrap"><table className="explorer-table"><thead><tr><th>Request</th><th>Route</th><th>Lifecycle</th><th>Decision</th><th>Evidence</th><th>Updated</th><th /></tr></thead><tbody>{records.map((record) => <tr key={record.requestId}><td><Link href={`/explorer/${record.requestId}`} className="explorer-request"><strong>{short(record.requestId)}</strong><small>{short(record.request.transactionHash)}</small></Link></td><td><code>{record.request.routeId ?? "gateway-adjudicator"}</code><small>{record.request.originChainId}</small></td><td><span className={`status-chip status-${record.status.toLowerCase()}`}>{statusLabel(record.status)}</span></td><td>{record.result ? <span className={`decision-chip decision-${record.result.decision.toLowerCase()}`}>{record.result.decision}</span> : <span className="muted-copy">Not final</span>}</td><td><code>{short(record.request.evidence.items[0]?.digest)}</code></td><td><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString()}</time></td><td><Link href={`/explorer/${record.requestId}`} aria-label={`Inspect ${record.requestId}`} className="icon-link"><ExternalLink size={15} /></Link></td></tr>)}</tbody></table><p className="table-caption">{records.length} record{records.length === 1 ? "" : "s"} · auto-refreshes while requests are active</p></section>}
  </main>;
}
