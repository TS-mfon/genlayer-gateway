import Link from "next/link";
import { ArrowRight, FlaskConical, ShieldCheck } from "lucide-react";
import { GatewayConsole } from "@/components/gateway-console";
import { publicConfig } from "@/lib/env";

export default function TestConsolePage() {
  return (
    <main className="app-page console-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TESTNET WORKBENCH · BASE SEPOLIA</span>
          <h1>Run one complete Gateway request.</h1>
          <p>
            Use two Base Sepolia wallets to create escrow, submit evidence, dispatch the request to the
            reviewed GenLayer route, and inspect the callback lifecycle.
          </p>
        </div>
        <span className="network-pill">Base → LayerZero → GenLayer</span>
      </div>
      <section className="console-callout">
        <div className="console-callout-icon"><FlaskConical size={19} /></div>
        <div>
          <strong>This is a guided test surface, not a generic contract caller.</strong>
          <p>
            Gateway only forwards reviewed route profiles with known encoders, result decoders, authorization,
            and replay protection.
          </p>
        </div>
        <Link className="text-link" href="/routes">Review active routes <ArrowRight size={15} /></Link>
      </section>
      <GatewayConsole config={publicConfig()} />
      <section className="landing-note">
        <ShieldCheck size={18} />
        <p>
          The current testnet result-attestor quorum is an operational trust assumption. It is not a
          cryptographic proof of GenLayer finality and must not be used for mainnet funds.
        </p>
      </section>
    </main>
  );
}
