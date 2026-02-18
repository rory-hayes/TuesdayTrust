import type { PrismaClient, UserRole } from '@evidenceq/database';

import type { FastifyReply } from 'fastify';

export class AuthzError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireOrgMember(prisma: PrismaClient, userId: string, orgId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      orgId
    },
    select: {
      id: true,
      orgId: true,
      role: true,
      email: true
    }
  });

  if (!user) {
    throw new AuthzError(403, 'User is not a member of this organization');
  }

  return user;
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'OWNER';
}

export async function requireOrgAdmin(prisma: PrismaClient, userId: string, orgId: string) {
  const user = await requireOrgMember(prisma, userId, orgId);

  if (!isAdminRole(user.role)) {
    throw new AuthzError(403, 'Admin role required for this action');
  }

  return user;
}

export async function requireClientAccess(prisma: PrismaClient, orgId: string, clientId: string) {
  const client = await prisma.clientWorkspace.findFirst({
    where: {
      id: clientId,
      orgId
    }
  });

  if (!client) {
    throw new AuthzError(404, 'Client workspace not found');
  }

  return client;
}

export async function requireProjectAccess(prisma: PrismaClient, orgId: string, projectId: string) {
  const project = await prisma.questionnaireProject.findFirst({
    where: {
      id: projectId,
      orgId
    }
  });

  if (!project) {
    throw new AuthzError(404, 'Project not found');
  }

  return project;
}

export function handleAuthzError(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof AuthzError)) {
    return false;
  }

  reply.code(error.statusCode);
  return true;
}
