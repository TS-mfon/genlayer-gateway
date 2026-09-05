import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";

const pages = [
  ["overview", "Overview"],
  ["integration", "Integration guide"],
  ["explorer", "Explorer guide"],
  ["evidence", "Testnet evidence"],
  ["quickstart", "Quick start"],
  ["routes", "Route model"],
  ["adapters", "Custom contracts"],
  ["protocol", "Protocol lifecycle"],
  ["api", "API reference"],
  ["security", "Security model"],
  ["testing", "Testing gates"],
  ["deployment", "Deployment"],
  ["ui", "Observatory guide"],
] as const;

export function generateStaticParams() {
  return [{ slug: [] }, ...pages.map(([slug]) => ({ slug: [slug] }))];
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const resolved = await params;
  const slug = resolved.slug?.[0] ?? "overview";
  if (!pages.some(([page]) => page === slug)) notFound();
  const filePath = path.join(process.cwd(), "content", "docs", `${slug}.mdx`);
  const source = await fs.readFile(filePath, "utf8");

  return (
    <main className="docs-shell">
      <aside className="docs-nav">
        {pages.map(([page, title]) => <Link key={page} href={`/docs/${page}`}>{title}</Link>)}
      </aside>
      <article className="docs-content"><MDXRemote source={source} /></article>
    </main>
  );
}
