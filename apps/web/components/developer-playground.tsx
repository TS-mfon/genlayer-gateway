"use client";

import Link from "next/link";
import { ArrowRight, Check, Clipboard, Code2, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { ToastRegion } from "./shared/toast-region";

type ReviewedRoute = {
  id: string;
  label: string;
  originChainId: number;
  destinationChainId: number;
  destinationContract: string;
  method: string;
  argumentSchema: string;
  resultSchema: string;
  status: "ACTIVE" | "PAUSED";
  trustModel: "ATTESTED_TESTNET" | "NATIVE_FINALITY_PROOF" | "THRESHOLD_ATTESTORS";
  executorReady: boolean;
};

type RouteResponse = { routes: ReviewedRoute[]; note?: string };

const exampleCallback = "0x0000000000000000000000000000000000000000";

function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function trustLabel(value: ReviewedRoute["trustModel"]) {
  if (value === "NATIVE_FINALITY_PROOF") return "Destination-verifiable finality";
  if (value === "THRESHOLD_ATTESTORS") return "Threshold-attested testnet";
  return "Attested testnet";
}

export function DeveloperPlayground() {
  const [routes, setRoutes] = useState<ReviewedRoute[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    question: "Did the submitted evidence satisfy every mandatory requirement?",
    policy: "Return PASS only when every requirement is proven by the pinned evidence. Return UNDETERMINED when evidence is unavailable or inconclusive.",
    evidenceUri: "https://example.com/evidence/job-42.json",
    callback: exampleCallback,
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/routes", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as RouteResponse;
        if (!response.ok) throw new Error("The reviewed route catalogue is unavailable.");
        if (!active) return;
        setRoutes(payload.routes);
        setSelectedId(payload.routes.find((route) => route.executorReady)?.id ?? payload.routes[0]?.id ?? "");
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Route catalogue loading failed.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selected = routes.find((route) => route.id === selectedId) ?? null;
  const payload = useMemo(() => ({
    routeId: selected?.id ?? "gateway-adjudicator",
    originChainId: selected?.originChainId ?? 84532,
    callback: form.callback,
    question: form.question,
    policy: form.policy,
    evidence: {
      version: "1",
      items: [{
        kind: "CONTENT_HASH",
        uri: form.evidenceUri,
        digest: keccak256(toBytes(`Replace this preview digest with the exact response body from ${form.evidenceUri}`)),
        metadata: { source: "developer-playground" },
      }],
    },
  }), [form, selected]);

  const requestPreview = JSON.stringify(payload, null, 2);
  const curlPreview = `curl -X POST "$GATEWAY_URL/api/v1/requests" \\\n  -H "Content-Type: application/json" \\\n  -d '${requestPreview.replaceAll("'", "'\\''")}'`;

  async function copy(value: string, label: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setToast(`${label} copied.`);
      window.setTimeout(() => setToast(""), 2400);
    } catch {
      setError("Clipboard access was denied. Select the text and copy it manually.");
    }
  }

  return (
    <main className="app-page developer-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEVELOPER WORKBENCH · REVIEWED ROUTES</span>
          <h1>Design your Gateway integration.</h1>
          <p>Select a reviewed GenLayer capability, inspect its trust boundary, and generate the request shape your origin application will submit.</p>
        </div>
        <Link className="button secondary" href="/docs/quickstart"><Code2 size={16} /> Read integration guide</Link>
      </div>

      <section className="developer-principle">
        <ShieldCheck size={20} />
        <div><strong>Your application keeps control.</strong><p>Gateway returns authenticated judgment. Your contract decides whether to release funds, update state, pause execution, or request human review.</p></div>
      </section>

      <div className="developer-layout">
        <section className="developer-composer">
          <div className="composer-heading"><div><span className="eyebrow">01 · CHOOSE CAPABILITY</span><h2>Reviewed GenLayer route</h2></div><Route size={20} /></div>
          {loading ? <p className="muted-copy">Loading reviewed routes…</p> : routes.length === 0 ? <div className="inline-empty"><strong>No routes configured</strong><p>Configure the testnet adjudicator before generating an integration.</p></div> : <div className="route-picker" role="radiogroup" aria-label="Reviewed GenLayer route">
            {routes.map((route) => <button key={route.id} type="button" role="radio" aria-checked={route.id === selectedId} className={route.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(route.id)}>
              <span className="route-picker-mark">{route.executorReady ? <Check size={14} /> : <LockKeyhole size={14} />}</span>
              <span><strong>{route.label}</strong><small>{route.executorReady ? "Executor verified" : "Profile only · unavailable"}</small></span>
            </button>)}
          </div>}

          <div className="composer-heading developer-step"><div><span className="eyebrow">02 · DEFINE JUDGMENT</span><h2>Request inputs</h2></div></div>
          <div className="form-grid developer-form">
            <label className="wide">Question<textarea value={form.question} onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))} /></label>
            <label className="wide">Policy<textarea value={form.policy} onChange={(event) => setForm((current) => ({ ...current, policy: event.target.value }))} /></label>
            <label className="wide">Pinned evidence URL<input value={form.evidenceUri} onChange={(event) => setForm((current) => ({ ...current, evidenceUri: event.target.value }))} /><small>Production requests must hash the exact evidence response body, commit, transaction, or immutable artifact.</small></label>
            <label className="wide">Origin callback contract<input value={form.callback} onChange={(event) => setForm((current) => ({ ...current, callback: event.target.value }))} /><small>The callback must authenticate Gateway and handle retries idempotently.</small></label>
          </div>
        </section>

        <aside className="developer-inspector">
          <div className="composer-heading"><div><span className="eyebrow">ROUTE CONTRACT</span><h2>{selected?.label ?? "Not configured"}</h2></div></div>
          {selected ? <>
            <dl className="detail-list">
              <div><dt>Status</dt><dd>{selected.executorReady ? "Ready for testnet" : "Unavailable"}</dd></div>
              <div><dt>Origin</dt><dd>Base Sepolia · {selected.originChainId}</dd></div>
              <div><dt>Destination</dt><dd>GenLayer Bradbury · {selected.destinationChainId}</dd></div>
              <div><dt>Contract</dt><dd title={selected.destinationContract}><code>{shortAddress(selected.destinationContract)}</code></dd></div>
              <div><dt>Method</dt><dd><code>{selected.method}</code></dd></div>
              <div><dt>Arguments</dt><dd><code>{selected.argumentSchema}</code></dd></div>
              <div><dt>Result</dt><dd><code>{selected.resultSchema}</code></dd></div>
              <div><dt>Return trust</dt><dd>{trustLabel(selected.trustModel)}</dd></div>
            </dl>
            {!selected.executorReady && <div className="route-warning"><LockKeyhole size={16} /><p>This profile is intentionally non-interactive until its encoder, decoder, authorization, replay protection, and testnet gate are verified.</p></div>}
          </> : <p className="muted-copy">A route must be configured before requests can be composed.</p>}
          <Link className="text-link" href="/docs/routes">Understand route activation <ArrowRight size={14} /></Link>
        </aside>
      </div>

      <section className="developer-output">
        <div className="developer-output-head"><div><span className="eyebrow">03 · INTEGRATE</span><h2>Request preview</h2><p>This preview shows the developer-facing semantic payload. A live request also includes the prepaid on-chain request ID, nonce, expiry, and dispatch transaction proof.</p></div><button className="button secondary" type="button" onClick={() => void copy(requestPreview, "Request JSON")}><Clipboard size={15} /> Copy JSON</button></div>
        <pre><code>{requestPreview}</code></pre>
        <div className="developer-output-actions"><button className="button ghost" type="button" onClick={() => void copy(curlPreview, "cURL example")}><Clipboard size={15} /> Copy cURL</button><Link className="button primary" href="/test-console">Run the funded MVP <ArrowRight size={15} /></Link></div>
      </section>

      <section className="developer-paths">
        <article><span>USE OUR CONTRACT</span><h3>Shared adjudicator</h3><p>Use the existing work-verification route when your decision fits question, policy, evidence, and PASS / FAIL / UNDETERMINED.</p><Link href="/docs/routes">Route model <ArrowRight size={14} /></Link></article>
        <article><span>BRING YOUR CONTRACT</span><h3>Managed route adapter</h3><p>Deploy your Intelligent Contract, publish its typed interface and validator strategy, then complete review and a route-specific testnet gate.</p><Link href="/docs/adapters">Onboarding package <ArrowRight size={14} /></Link></article>
        <article><span>OPERATE THE STACK</span><h3>Self-hosted adapter</h3><p>Reuse the envelopes and origin interfaces while operating your own submitter, reconciliation, result authentication, and monitoring.</p><Link href="/docs/adapters">Security responsibilities <ArrowRight size={14} /></Link></article>
      </section>
      <ToastRegion message={toast} error={error} />
    </main>
  );
}
