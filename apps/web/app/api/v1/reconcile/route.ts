import { getServerEnv } from "@/lib/env";
import { reconcileRequests } from "@/lib/services/reconcile";

export const maxDuration = 60;

export function isAuthorizedReconcile(
  authorization: string | null,
  reconcileSecret: string,
  cronSecret?: string,
) {
  const secret = authorization?.replace(/^Bearer\s+/i, "");
  return secret === reconcileSecret || Boolean(cronSecret && secret === cronSecret);
}

async function run(request: Request) {
  const env = getServerEnv();
  if (!isAuthorizedReconcile(
    request.headers.get("authorization"),
    env.RECONCILE_SECRET,
    env.CRON_SECRET,
  )) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return Response.json(await reconcileRequests());
}

export const GET = run;
export const POST = run;
