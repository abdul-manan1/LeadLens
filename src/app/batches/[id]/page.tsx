import { BatchWorkspace } from "@/components/BatchWorkspace";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BatchWorkspace id={id} />;
}
