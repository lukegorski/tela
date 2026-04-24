/**
 * tRPC client. Wraps the @tela/api router via @trpc/react-query so we get
 * full type-safety on every endpoint.
 *
 * Each request grabs the current Supabase access token and attaches it as
 * the Authorization header — that's what our auth middleware in apps/api
 * validates.
 */
'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@tela/api/router';

export const trpc = createTRPCReact<AppRouter>();
