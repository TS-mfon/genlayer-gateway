"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type Trace = {
  requestId: string;
  status: string;
  updatedAt: string;
  lifecycle: Array<{ status: string; at: string; detail?: string }>;
  result?: { decision: string; reason: string; genlayerTransaction?: string };
  bridge?: { inboundMessageId?: string; genlayerTransaction?: string; returnTransaction?: string };
};

const labels: Record<string, string> = {
  CREATED: "Request created",
  DISPATCHED: "Sent from Base",
  DELIVERED: "Received by the hub",
  ADJUDICATING: "GenLayer is reviewing",
  REQUIRES_REVIEW: "Review requires attention",
  FINALIZED: "GenLayer decision finalized",
  RETURN_DISPATCHED: "Decision sent back to Base",
  RETURNED: "Decision received on Base",
  CALLBACK_PENDING: "Settlement callback pending",
  CALLBACK_EXECUTED: "Settlement complete",
  FAILED: "Request failed",
  TIMED_OUT: "Request timed out",
};

function short(value?: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "Not recorded";
}

export function RequestTrace({ requestId }: { requestId: string }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/requests/${requestId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Trace unavailable");
      setTrace(payload);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trace unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [requestId]);

  return (
    <main className="app-page narrow-page">
      <Link className="text-link" href="/dashboard/client"><ArrowLeft size={15} /> Back to dashboard</Link>
      <div className="page-heading">
        <div><span className="eyebrow">PROTOCOL TRACE</span><h1>Request progress</h1><p>Follow the decision as it moves between Base, the hub, GenLayer, and the final callback.</p></div>
        <button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
      {error ? <section className="empty-state"><h2>Trace unavailable</h2><p>{error}</p></section> : trace ? <>
        <section className="detail-card trace-summary"><div><span className="eyebrow">REQUEST ID</span><code>{short(trace.requestId)}</code></div><div><span className="eyebrow">CURRENT STAGE</span><strong>{labels[trace.status] ?? trace.status}</strong></div></section>
        <section className="detail-card"><h2>Journey</h2><ol className="trace-list">{trace.lifecycle.map((event, index) => <li key={`${event.status}-${event.at}-${index}`}><span className="trace-icon">{index < trace.lifecycle.length - 1 ? <CheckCircle2 size={17} /> : <CircleDashed size={17} />}</span><div><strong>{labels[event.status] ?? event.status}</strong><small>{new Date(event.at).toLocaleString()}</small>{event.detail && <p>{event.detail}</p>}</div></li>)}</ol></section>
        {trace.result && <section className="detail-card"><div className="detail-heading"><div><span className="eyebrow">FINAL DECISION</span><h2>{trace.result.decision}</h2></div><span className="network-pill">Settled</span></div><p>{trace.result.reason}</p><dl className="detail-list"><div><dt>GenLayer transaction</dt><dd><code>{short(trace.result.genlayerTransaction ?? trace.bridge?.genlayerTransaction)}</code></dd></div><div><dt>Return transaction</dt><dd><code>{short(trace.bridge?.returnTransaction)}</code></dd></div></dl></section>}
      </> : <section className="empty-state"><p>Loading request trace…</p></section>}
    </main>
  );
}
