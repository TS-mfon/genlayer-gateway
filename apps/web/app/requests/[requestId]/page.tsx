import { RequestTrace } from "@/components/request-trace";

export default async function RequestTracePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <RequestTrace requestId={requestId} />;
}
