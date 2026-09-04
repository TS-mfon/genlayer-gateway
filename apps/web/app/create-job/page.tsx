import { CreateJobForm } from "@/components/create-job-form";
import { publicConfig } from "@/lib/env";
export default function CreateJobPage() { return <CreateJobForm config={publicConfig()} />; }
