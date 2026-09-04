import { configuredRoutes, isRouteUsable } from "@/lib/routes";

export async function GET(_request: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const route = configuredRoutes().find((candidate) => candidate.id === routeId);
  if (!route) {
    return Response.json({ error: "ROUTE_NOT_FOUND", routeId }, { status: 404 });
  }

  const executorReady = isRouteUsable(route);

  return Response.json({
    route: { ...route, executorReady },
    usage: {
      destinationIsReviewed: true,
      arbitraryDestinationExecution: false,
      requestPath: "origin application → Gateway contract → transport → GenLayer route → authenticated callback",
    },
  }, { headers: { "Cache-Control": "public, max-age=30" } });
}
