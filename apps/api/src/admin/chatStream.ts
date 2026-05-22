/**
 * SSE endpoint for streaming admin chat. Mounted at POST /admin/chat/stream.
 *
 * Auth: same Bearer-token model as /chat/stream, plus a defense-in-depth
 * admin gate. Non-admin (or unauthenticated) callers get 403 / 401 before
 * the SSE stream opens. Service-account tokens count as admin per the
 * auth layer's existing convention.
 *
 * Body: { conversationId, message, currentRoute? }. No attachments — admin
 * chat is text-only.
 *
 * Response: text/event-stream of ChatStreamEvent objects. Shape matches
 * /chat/stream so the AdminAiChat UI can reuse user-chat event rendering.
 */
import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  runInContext,
  streamAdminChat,
  type ChatStreamEvent,
} from '@tela/capabilities';
import { contextFromAuthHeader, AuthError } from '../auth.js';
import { logger } from '../logger.js';

const inputSchema = z.object({
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().min(1).max(4000),
  /**
   * The admin's current page path (e.g. '/admin/users/abc123'). Passed
   * to the streamAdminChat generator so the system prompt can resolve
   * "this user" / "this conversation" against the admin's context.
   */
  currentRoute: z.string().max(500).optional(),
});

export function mountAdminChatStream(app: Hono): void {
  app.post('/admin/chat/stream', async (c: Context) => {
    // Auth — short-circuit before opening the SSE stream so we can return
    // a normal HTTP error response.
    const authHeader = c.req.header('authorization');
    let requestContext;
    try {
      requestContext = await contextFromAuthHeader(authHeader);
    } catch (err) {
      if (err instanceof AuthError) {
        return c.json({ error: err.message, code: err.code }, 401);
      }
      throw err;
    }

    // Admin gate — defense in depth. The capability layer also rejects
    // non-admin callers (admin.streamAdminChat -> buildToolCatalog({
    // includeAdmin: true }) -> only requiresAdmin tools, plus the
    // generator inserts is_admin_chat = true on conversation creation),
    // but rejecting here keeps the SSE stream from opening for non-admins.
    if (!requestContext.isAdmin) {
      return c.json({ error: 'Admin access required' }, 403);
    }

    // Parse + validate body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    }

    return streamSSE(c, async (stream) => {
      const send = async (event: ChatStreamEvent) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      };

      try {
        // Same AsyncLocalStorage pattern as /chat/stream — keep the whole
        // generator iteration inside runInContext so context survives the
        // tool-call fanout (parallel Promise.all in streamAdminChat).
        await runInContext(requestContext, async () => {
          for await (const event of streamAdminChat(parsed.data)) {
            await send(event);
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, userId: requestContext.userId }, 'admin chat stream failed');
        await send({ type: 'error', message });
      }
    });
  });
}
