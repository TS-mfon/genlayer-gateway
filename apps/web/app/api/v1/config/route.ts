import { publicConfig } from "@/lib/env";

export async function GET() {
  return Response.json(publicConfig(), {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
