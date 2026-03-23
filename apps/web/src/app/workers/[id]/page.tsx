import { CrmApp } from "../../../components/crm-app";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmApp section="workers" entityId={id} />;
}
