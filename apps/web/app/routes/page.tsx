import Link from "next/link";
import { ArrowRight, CircleCheck, CirclePause, ShieldCheck } from "lucide-react";
import { configuredRoutes, isRouteUsable } from "@/lib/routes";

const trustLabels = {
  ATTESTED_TESTNET: "Quorum-attested testnet",
  NATIVE_FINALITY_PROOF: "Native finality proof",
  THRESHOLD_ATTESTORS: "Threshold attestors",
} as const;

export default function RoutesPage() {
  const routes = configuredRoutes();
  return (
    <main className="app-page routes-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEVELOPER SURFACE · ALLOWLIST</span>
          <h1>Reviewed GenLayer routes</h1>
          <p>Gateway routes are explicit profiles, not arbitrary contract calls. Each one binds a destination, method, schemas, and trust boundary.</p>
        </div>
        <span className="network-pill">Base Sepolia → Bradbury</span>
      </div>
      {routes.length === 0 ? (
        <section className="empty-state"><ShieldCheck className="empty-icon" /><h2>No reviewed routes configured</h2><p>Set a reviewed route profile on the server before accepting requests.</p><Link className="button primary" href="/docs/routes">Read the route model <ArrowRight size={15} /></Link></section>
      ) : (
        <div className="route-cards">
          {routes.map((route) => {
            const active = route.status === "ACTIVE";
            return <article className={`route-card ${active ? "route-active" : "route-paused"}`} key={route.id}>
              <div className="route-card-top"><span className="route-card-status">{active ? <CircleCheck size={15} /> : <CirclePause size={15} />}{active ? "Active" : "Paused"}</span><code>{route.id}</code></div>
              <h2>{route.label}</h2>
              <p className="muted-copy">{route.originChainId} → {route.destinationChainId}</p>
              <dl className="detail-list route-card-details"><div><dt>Destination</dt><dd><code>{route.destinationContract}</code></dd></div><div><dt>Method</dt><dd><code>{route.method}</code></dd></div><div><dt>Arguments</dt><dd><code>{route.argumentSchema}</code></dd></div><div><dt>Result</dt><dd><code>{route.resultSchema}</code></dd></div></dl>
              <div className="route-trust"><ShieldCheck size={15} /><span>{trustLabels[route.trustModel]}</span></div>
              <div className={`route-executor ${isRouteUsable(route) ? "ready" : "not-ready"}`}><span aria-hidden="true" />{isRouteUsable(route) ? "Tested executor available" : "Profile only · executor not activated"}</div>
            </article>;
          })}
        </div>
      )}
      <div className="route-page-actions"><Link className="button primary" href="/playground">Open developer playground <ArrowRight size={15} /></Link><Link className="button secondary" href="/docs/adapters">Bring your own contract</Link></div>
      <section className="landing-note"><ShieldCheck size={18} /><p>Adding a profile does not make a contract trusted by itself. The relay must implement and test that route’s typed encoder, result decoder, authorization, and replay protection before activation.</p></section>
    </main>
  );
}
