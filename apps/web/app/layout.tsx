import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "GenLayer Gateway",
  description: "The interchain adjudication layer for applications and autonomous agents.",
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="topbar">
            <Link href="/" className="brand" aria-label="GenLayer Gateway home">
              <img src="/icons/favicon.svg" alt="" width="34" height="34" />
              <span>GenLayer Gateway</span>
            </Link>
            <nav className="product-nav" aria-label="Product navigation">
              <Link href="/explorer">Explorer</Link>
              <Link href="/docs/routes">Routes</Link>
              <Link href="/docs/overview">Docs</Link>
              <Link href="/evidence">Evidence</Link>
            </nav>
            <div className="topbar-actions">
              <span className="network-pill">Base Sepolia · testnet</span>
              <Link className="button primary topbar-cta" href="/docs/integration">Integrate <span aria-hidden="true">↗</span></Link>
            </div>
          </header>
          {children}
          <footer>
            <span>GenLayer Gateway v0.1.0</span>
            <span>Testnet software — not audited for production funds.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
