import { ClientWorkspaceView } from './client-workspace-view';

type ClientWorkspacePageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function ClientWorkspacePage({ params }: ClientWorkspacePageProps) {
  const { clientId } = await params;

  return <ClientWorkspaceView clientId={clientId} />;
}
