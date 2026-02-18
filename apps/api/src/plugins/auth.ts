import type { PrismaClient } from '@evidenceq/database';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { FastifyPluginAsync } from 'fastify';

import { toSlug } from '../lib/slug';

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function requireBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

async function ensureOrgAndUser(prisma: PrismaClient, auth: { orgId: string; userId: string; email?: string }) {
  const orgSlug = toSlug(auth.orgId) || `org-${Date.now()}`;

  await prisma.org.upsert({
    where: { id: auth.orgId },
    update: {},
    create: {
      id: auth.orgId,
      name: `Org ${auth.orgId}`,
      slug: orgSlug
    }
  });

  await prisma.user.upsert({
    where: { id: auth.userId },
    update: {
      email: auth.email ?? `${auth.userId}@local.dev`
    },
    create: {
      id: auth.userId,
      orgId: auth.orgId,
      email: auth.email ?? `${auth.userId}@local.dev`
    }
  });
}

function parseOrgId(payload: JWTPayload): string | undefined {
  const direct = payload.org_id;

  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const custom = payload['org_id'];

  if (typeof custom === 'string' && custom.length > 0) {
    return custom;
  }

  return undefined;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  const issuer = process.env.CLERK_JWT_ISSUER?.trim();
  const audience = process.env.CLERK_JWT_AUDIENCE?.trim();
  const isClerkConfigured = Boolean(issuer);
  const isDevAuthEnabled =
    process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_ENABLED === 'true';
  const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, '')}/.well-known/jwks.json`)) : null;

  app.addHook('onRequest', async (request, reply) => {
    const requestUrl = request.raw.url ?? request.url;
    if (requestUrl.startsWith('/health') || request.method === 'OPTIONS') {
      request.auth = {
        orgId: process.env.DEV_AUTH_ORG_ID ?? 'org_dev',
        userId: process.env.DEV_AUTH_USER_ID ?? 'user_dev',
        email: process.env.DEV_AUTH_EMAIL ?? 'dev-consultant@example.com',
        authMode: 'dev'
      };
      return;
    }

    const token = requireBearerToken(readHeader(request.headers.authorization));

    if (!token) {
      reply.code(401);
      throw new Error('Missing bearer token');
    }

    if (!isClerkConfigured) {
      if (!isDevAuthEnabled) {
        reply.code(401);
        throw new Error('Auth is not configured. Configure Clerk JWT or enable DEV_AUTH locally.');
      }

      if (token !== 'dev') {
        reply.code(401);
        throw new Error('Invalid token for dev auth mode');
      }

      request.auth = {
        orgId: readHeader(request.headers['x-org-id']) ?? process.env.DEV_AUTH_ORG_ID ?? 'org_dev',
        userId: readHeader(request.headers['x-user-id']) ?? process.env.DEV_AUTH_USER_ID ?? 'user_dev',
        email:
          readHeader(request.headers['x-user-email']) ??
          process.env.DEV_AUTH_EMAIL ??
          'dev-consultant@example.com',
        authMode: 'dev'
      };

      await ensureOrgAndUser(app.services.prisma, request.auth);
      return;
    }

    if (!jwks || !issuer) {
      reply.code(500);
      throw new Error('Clerk auth is misconfigured');
    }

    try {
      const verifyOptions: {
        issuer: string;
        audience?: string;
      } = {
        issuer
      };

      if (audience) {
        verifyOptions.audience = audience;
      }

      const verification = await jwtVerify(token, jwks, {
        ...verifyOptions
      });

      const orgId = parseOrgId(verification.payload);

      if (!orgId) {
        reply.code(401);
        throw new Error('Token does not include org_id claim');
      }

      if (!verification.payload.sub) {
        reply.code(401);
        throw new Error('Token does not include subject claim');
      }

      request.auth = {
        orgId,
        userId: verification.payload.sub,
        email:
          typeof verification.payload.email === 'string'
            ? verification.payload.email
            : `${verification.payload.sub}@clerk.local`,
        authMode: 'clerk'
      };

      await ensureOrgAndUser(app.services.prisma, request.auth);
    } catch (error) {
      request.log.warn({ error }, 'auth verification failed');
      reply.code(401);
      throw new Error('Unauthorized');
    }
  });
};

export default fp(authPlugin, { name: 'auth' });
