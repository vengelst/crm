import { CrmApp } from "../../../components/crm-app";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmApp section="projects" entityId={id} />;
}
