import { getServerEnv } from "@/lib/env";
import { assertSafeEvidenceUrl } from "@/lib/security/ssrf";
import { getDatabase } from "@/lib/db/mongodb";
import { bytesToHex, keccak256 } from "viem";

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceUrl?: string };
    if (!body.sourceUrl) return Response.json({ error: "SOURCE_URL_REQUIRED" }, { status: 400 });
    const env = getServerEnv();
    const domains = (env.EVIDENCE_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    let url = await assertSafeEvidenceUrl(body.sourceUrl, domains);
    let response: Response | undefined;
    for (let redirect = 0; redirect <= 3; redirect++) {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect has no location");
      url = await assertSafeEvidenceUrl(new URL(location, url).toString(), domains);
    }
    if (!response || !response.ok) return Response.json({ error: "SOURCE_UNAVAILABLE" }, { status: 502 });
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!/^text\/(plain|markdown|csv)|application\/json/.test(contentType)) {
      return Response.json({ error: "UNSUPPORTED_CONTENT_TYPE" }, { status: 415 });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) return Response.json({ error: "EVIDENCE_TOO_LARGE" }, { status: 413 });
    const digest = keccak256(bytesToHex(bytes));
    const evidenceId = `ev_${digest.slice(2, 26)}`;
    const now = new Date().toISOString();
    await (await getDatabase()).collection("evidence").updateOne(
      { evidenceId },
      { $setOnInsert: { evidenceId, sourceUrl: url.toString(), contentType, body: Buffer.from(bytes).toString("base64"), digest, createdAt: now } },
      { upsert: true },
    );
    return Response.json({ evidenceId, digest, contentType, size: bytes.byteLength }, { status: 201, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence snapshot failed";
    return Response.json({ error: "INVALID_EVIDENCE_SOURCE", detail: message }, { status: 400 });
  }
}
