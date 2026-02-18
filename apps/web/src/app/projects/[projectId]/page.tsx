import { ProjectWorkspaceView } from './project-workspace-view';

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return <ProjectWorkspaceView projectId={projectId} />;
}
