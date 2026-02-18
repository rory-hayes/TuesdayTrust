import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AuthzError,
  requireClientAccess,
  requireOrgAdmin,
  requireOrgMember,
  requireProjectAccess
} from './authz';

test('requireOrgMember scopes lookup by orgId', async () => {
  let lastWhere: Record<string, unknown> | null = null;

  const prisma = {
    user: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        lastWhere = args.where;
        return null;
      }
    }
  } as never;

  await assert.rejects(() => requireOrgMember(prisma, 'user_1', 'org_1'), AuthzError);
  assert.deepEqual(lastWhere, { id: 'user_1', orgId: 'org_1' });
});

test('requireOrgAdmin rejects non-owner roles', async () => {
  const prisma = {
    user: {
      findFirst: async () => ({
        id: 'user_1',
        orgId: 'org_1',
        role: 'CONSULTANT',
        email: 'consultant@example.com'
      })
    }
  } as never;

  await assert.rejects(() => requireOrgAdmin(prisma, 'user_1', 'org_1'), AuthzError);
});

test('requireClientAccess scopes by orgId and client id', async () => {
  let lastWhere: Record<string, unknown> | null = null;

  const prisma = {
    clientWorkspace: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        lastWhere = args.where;
        return {
          id: 'client_1',
          orgId: 'org_1'
        };
      }
    }
  } as never;

  const client = await requireClientAccess(prisma, 'org_1', 'client_1');
  assert.equal(client.id, 'client_1');
  assert.deepEqual(lastWhere, { id: 'client_1', orgId: 'org_1' });
});

test('requireProjectAccess scopes by orgId and project id', async () => {
  let lastWhere: Record<string, unknown> | null = null;

  const prisma = {
    questionnaireProject: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        lastWhere = args.where;
        return {
          id: 'project_1',
          orgId: 'org_1'
        };
      }
    }
  } as never;

  const project = await requireProjectAccess(prisma, 'org_1', 'project_1');
  assert.equal(project.id, 'project_1');
  assert.deepEqual(lastWhere, { id: 'project_1', orgId: 'org_1' });
});
