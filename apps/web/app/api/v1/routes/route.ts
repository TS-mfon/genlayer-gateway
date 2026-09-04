import { configuredRoutes, isRouteUsable } from "@/lib/routes";

export async function GET() {
  const routes = configuredRoutes().map((route) => ({
    ...route,
    executorReady: isRouteUsable(route),
  }));
  return Response.json({ routes, testnetOnly: true, note: "Only reviewed routes are returned. A syntactically valid GenLayer address is not automatically trusted." }, { headers: { "Cache-Control": "public, max-age=30" } });
}
