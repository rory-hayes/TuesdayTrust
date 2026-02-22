import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AuthzError,
  handleAuthzError,
  isAdminRole,
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

test('requireOrgMember returns user when member exists', async () => {
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

  const user = await requireOrgMember(prisma, 'user_1', 'org_1');
  assert.equal(user.id, 'user_1');
});

test('isAdminRole returns true only for OWNER', () => {
  assert.equal(isAdminRole('OWNER'), true);
  assert.equal(isAdminRole('CONSULTANT'), false);
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

test('requireOrgAdmin returns owner', async () => {
  const prisma = {
    user: {
      findFirst: async () => ({
        id: 'user_1',
        orgId: 'org_1',
        role: 'OWNER',
        email: 'owner@example.com'
      })
    }
  } as never;

  const user = await requireOrgAdmin(prisma, 'user_1', 'org_1');
  assert.equal(user.role, 'OWNER');
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

test('requireClientAccess throws when client does not exist', async () => {
  const prisma = {
    clientWorkspace: {
      findFirst: async () => null
    }
  } as never;

  await assert.rejects(
    () => requireClientAccess(prisma, 'org_1', 'missing_client'),
    (error: unknown) => error instanceof AuthzError && error.statusCode === 404
  );
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

test('requireProjectAccess throws when project does not exist', async () => {
  const prisma = {
    questionnaireProject: {
      findFirst: async () => null
    }
  } as never;

  await assert.rejects(
    () => requireProjectAccess(prisma, 'org_1', 'missing_project'),
    (error: unknown) => error instanceof AuthzError && error.statusCode === 404
  );
});

test('handleAuthzError maps AuthzError status code onto reply', () => {
  let statusCode: number | null = null;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    }
  } as never;

  const handled = handleAuthzError(reply, new AuthzError(403, 'Forbidden'));
  assert.equal(handled, true);
  assert.equal(statusCode, 403);
});

test('handleAuthzError ignores non-auth errors', () => {
  const reply = {
    code(code: number) {
      void code;
      throw new Error('should not be called');
    }
  } as never;

  const handled = handleAuthzError(reply, new Error('unexpected'));
  assert.equal(handled, false);
});
