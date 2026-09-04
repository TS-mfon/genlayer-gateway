import { JobDetail } from "@/components/job-detail";
import { publicConfig } from "@/lib/env";
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <JobDetail id={id} config={publicConfig()} />; }
