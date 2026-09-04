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
            <nav aria-label="Primary navigation">
              <Link href="/create-job">Post a job</Link>
              <Link href="/dashboard/client">Client dashboard</Link>
              <Link href="/dashboard/worker">Worker dashboard</Link>
              <Link href="/test-console">Test console</Link>
              <Link href="/playground">Developer playground</Link>
              <Link href="/routes">Routes</Link>
              <Link href="/docs/overview">Docs</Link>
              <a href="/api/v1/health">API health</a>
            </nav>
            <span className="network-pill">Base Sepolia · testnet</span>
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
