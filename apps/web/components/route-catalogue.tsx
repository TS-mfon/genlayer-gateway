"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, Route, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type RouteProfile = {
  id: string;
  label: string;
  destinationChainId: number;
  destinationContract: string;
  method: string;
  argumentSchema: string;
  resultSchema: string;
  status: "ACTIVE" | "PAUSED";
  trustModel: string;
  executorReady: boolean;
};

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function trustLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export function RouteCatalogue() {
  const [routes, setRoutes] = useState<RouteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/routes", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { routes?: RouteProfile[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Route catalogue unavailable.");
        if (active) setRoutes(payload.routes ?? []);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Route catalogue unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="route-catalogue" aria-labelledby="route-catalogue-heading">
      <div className="section-title route-catalogue-heading">
        <div>
          <span className="eyebrow">REVIEWED DESTINATIONS</span>
          <h2 id="route-catalogue-heading">Choose a capability, not an address.</h2>
        </div>
        <Link className="text-link" href="/docs/routes">Route model <ArrowRight size={14} /></Link>
      </div>
      <p className="route-catalogue-intro">Each route binds an origin, one GenLayer contract, a method, typed schemas, and a disclosed trust model. Gateway never treats a browser-supplied destination as trusted.</p>
      {loading ? <div className="route-catalogue-empty">Loading reviewed routes…</div> : error ? <div className="route-catalogue-empty route-catalogue-error"><CircleAlert size={16} /> {error}</div> : routes.length === 0 ? <div className="route-catalogue-empty">No reviewed routes are configured for this environment.</div> : <div className="route-catalogue-grid">{routes.map((route) => <article className="route-profile" key={route.id}>
        <div className="route-profile-top"><span className={`status-chip ${route.status === "ACTIVE" && route.executorReady ? "status-finalized" : "status-failed"}`}>{route.status === "ACTIVE" && route.executorReady ? "Ready" : route.status.toLowerCase()}</span><span className="route-profile-id">{route.id}</span></div>
        <h3>{route.label}</h3>
        <dl className="route-profile-list">
          <div><dt>Destination</dt><dd><code>{shortAddress(route.destinationContract)}</code><small>GenLayer {route.destinationChainId}</small></dd></div>
          <div><dt>Method</dt><dd><code>{route.method}</code></dd></div>
          <div><dt>Arguments</dt><dd><code>{route.argumentSchema}</code></dd></div>
          <div><dt>Result</dt><dd><code>{route.resultSchema}</code></dd></div>
        </dl>
        <div className="route-profile-foot"><span><ShieldCheck size={13} /> {trustLabel(route.trustModel)}</span><Link href="/docs/routes">Inspect route <ArrowRight size={13} /></Link></div>
      </article>)}</div>}
      <div className="route-catalogue-note"><Route size={15} /><span>Metadata alone does not activate a route. A destination-specific executor, tests, and testnet evidence are required.</span></div>
    </section>
  );
}
