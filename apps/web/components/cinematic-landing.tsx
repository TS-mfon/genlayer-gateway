"use client";

import Link from "next/link";
import { ArrowUpRight, Check, ChevronRight, FileText, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

const VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_112712_da9d53df-6d27-4b12-bdf6-aa9dc2622bdf.mp4";

function GatewayMark() {
  return (
    <svg className="cinematic-mark" viewBox="0 0 31.5 48.5" role="img" aria-label="GenLayer Gateway mark">
      <defs>
        <linearGradient id="gateway-mark-gradient" x1="8" y1="0" x2="34.1" y2="28.9">
          <stop offset="0" stopColor="#9e9e9e" /><stop offset=".28" stopColor="#a6a6a6" />
          <stop offset=".4" stopColor="#3a3a3a" /><stop offset=".6" stopColor="#7a7a7a" />
          <stop offset=".8" stopColor="#a9a9a9" /><stop offset="1" stopColor="#ccc" />
        </linearGradient>
      </defs>
      <path d="M21.5 0v19.5h10V29L10 48.5v-20H.5v-10Z" fill="url(#gateway-mark-gradient)" />
      <rect x=".5" y="18.5" width="9" height="10" fill="#fdfdfd" />
      <rect x="22" y="19.5" width="9.5" height="9.5" fill="#fdfdfd" />
    </svg>
  );
}

function PartnerMark({ variant }: { variant: 1 | 2 | 3 | 4 }) {
  if (variant === 1) return <svg viewBox="0 0 30 31" aria-hidden="true"><circle cx="15" cy="15.5" r="11.5" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="19.5" cy="10.5" r="5.1" fill="#050505" /><circle cx="15" cy="15.5" r="3" fill="currentColor" /></svg>;
  if (variant === 2) return <svg viewBox="0 0 25 30" aria-hidden="true"><path d="M12.5 2v26M12.5 2a11 11 0 1 1 0 22 7 7 0 1 0 0-14 7 7 0 0 1 0-8Z" fill="none" stroke="currentColor" strokeWidth="3" /></svg>;
  if (variant === 3) return <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12.35" fill="none" stroke="currentColor" strokeWidth="3.1" /><path d="M7 14c0-4 3-7 7-7s7 3 7 7-3 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" /><path d="M21 14c0 4-3 7-7 7s-7-3-7-7" fill="none" stroke="currentColor" strokeWidth="2.6" /></svg>;
  return <svg viewBox="0 0 28 25.5" aria-hidden="true"><path d="M1 14c4-8 9-11 14-9 4 1 7 5 12 1v7c-5 4-8 2-12 0-5-3-9 0-14 7Z" fill="currentColor" /><path d="M2 20c5-3 9-3 13 0 4 2 8 2 11-1M3 24c4-2 8-2 12 0 4 1 7 1 10-1" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>;
}

export function CinematicLanding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnResize = () => { if (window.matchMedia("(min-aspect-ratio: 11/10)").matches) setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", closeOnResize); };
  }, []);

  const closeMenu = () => setOpen(false);
  const menuTabIndex = open ? 0 : -1;

  return (
    <main className={`cinematic-landing ${open ? "is-open" : ""}`}>
      <div className="cinematic-plate" aria-hidden="true">
        <video className="cinematic-video" autoPlay muted loop playsInline preload="auto">
          <source src={VIDEO_URL} type="video/mp4" />
        </video>
      </div>
      <header className="cinematic-topbar">
        <Link href="/" className="cinematic-brand" aria-label="GenLayer Gateway home"><GatewayMark /></Link>
        <nav className="cinematic-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a><a href="#evidence">Evidence</a><Link href="/explorer">Explorer</Link><Link href="/docs/overview">Docs</Link>
        </nav>
        <Link className="cinematic-pill cinematic-pill-nav" href="/explorer">Open explorer <Search size={15} /></Link>
        <button className="cinematic-burger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="cinematic-menu" onClick={() => setOpen((current) => !current)}>{open ? <X /> : <Menu />}</button>
      </header>
      <nav id="cinematic-menu" className="cinematic-menu" aria-label="Mobile navigation" aria-hidden={!open}>
        <div className="cinematic-menu-inner"><span className="cinematic-menu-eyebrow">Gateway / Menu</span><div className="cinematic-menu-list"><a tabIndex={menuTabIndex} href="#how-it-works" onClick={closeMenu}>How it works <ChevronRight /></a><a tabIndex={menuTabIndex} href="#evidence" onClick={closeMenu}>Evidence <ChevronRight /></a><Link tabIndex={menuTabIndex} href="/explorer" onClick={closeMenu}>Explorer <ChevronRight /></Link><Link tabIndex={menuTabIndex} href="/docs/overview" onClick={closeMenu}>Docs <ChevronRight /></Link></div><div className="cinematic-menu-foot"><Link tabIndex={menuTabIndex} className="cinematic-pill" href="/explorer" onClick={closeMenu}>Open explorer <Search size={15} /></Link><Link tabIndex={menuTabIndex} className="cinematic-ghost" href="/docs/integration" onClick={closeMenu}>Read integration guide</Link></div></div>
      </nav>
      <section className="cinematic-hero" aria-labelledby="gateway-headline">
        <span className="cinematic-kicker">GENLAYER GATEWAY / TESTNET</span>
        <h1 id="gateway-headline"><span>Bring GenLayer</span><span>judgment to any chain.</span></h1>
        <p className="cinematic-sub">A developer gateway for sending structured decisions from the chain you already use to a reviewed GenLayer contract—and receiving the result back.</p>
        <div className="cinematic-actions"><Link className="cinematic-pill cinematic-pill-hero" href="/explorer">Inspect live requests <Search size={16} /></Link><Link className="cinematic-ghost" href="/docs/integration">Read integration guide <FileText size={16} /></Link></div>
        <div className="cinematic-role-entry" aria-label="Developer entry points"><span>DEVELOPER SURFACES</span><Link href="/explorer">Explore activity <ArrowUpRight size={13} /></Link><Link href="/docs/routes">Review routes <ArrowUpRight size={13} /></Link></div>
      </section>
      <section className="cinematic-path" id="how-it-works" aria-label="Gateway request path"><div className="cinematic-path-label">ONE REQUEST / FOUR BOUNDARIES</div><div className="cinematic-path-line"><span><b>01</b>Your chain</span><i><Check /></i><span><b>02</b>LayerZero V2</span><i><Check /></i><span className="path-active"><b>03</b>GenLayer route</span><i><Check /></i><span><b>04</b>Your callback</span></div><p>Base signs. Gateway transports. The selected Intelligent Contract judges. Your application decides what happens next.</p></section>
      <section className="cinematic-developer-note" id="evidence"><span className="cinematic-kicker">VERIFIED TESTNET EVIDENCE</span><strong>19 of 20 prepared jobs settled correctly.</strong><p>Inspect the deployed route, smoke test, LayerZero messages, GenLayer transactions, and the documented fail-closed outlier.</p><Link className="cinematic-inline-link" href="/evidence">View evidence record <ArrowUpRight size={14} /></Link></section>
      <section className="cinematic-partners" aria-label="Integration layers"><div><PartnerMark variant={1} /><span>origin applications</span></div><div><PartnerMark variant={2} /><span>transport adapters</span></div><div><PartnerMark variant={3} /><span>intelligent contracts</span></div><div><PartnerMark variant={4} /><span>callbacks</span></div></section>
      <div className="cinematic-disclaimer">Testnet software · attestor-backed result delivery · not mainnet financial infrastructure</div>
    </main>
  );
}
