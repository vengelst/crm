import { CrmApp } from "../../../components/crm-app";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmApp section="customers" entityId={id} />;
}
