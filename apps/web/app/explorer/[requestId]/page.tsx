import { ExplorerDetail } from "@/components/explorer-detail";
export default async function ExplorerRequestPage({ params }: { params: Promise<{ requestId: string }> }) { return <ExplorerDetail requestId={(await params).requestId} />; }
