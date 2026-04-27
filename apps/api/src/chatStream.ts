/**
 * SSE endpoint for streaming chat. Mounted at POST /chat/stream.
 *
 * Auth: same Bearer-token model as tRPC. Body: { conversationId, message,
 * locale }. Response: text/event-stream of ChatStreamEvent objects.
 *
 * Each event is one SSE "data:" frame. Events:
 *   - user-saved: the user message has been persisted
 *   - thinking: between rounds while the model decides
 *   - tool-start / tool-end: a tool call is being executed
 *   - text-delta: a chunk of the assistant's text reply
 *   - done: the assistant's message has been persisted; final ids included
 *   - error: terminal failure
 *
 * Railway / Cloudflare buffering note: SSE works through Railway's edge as
 * long as we set Content-Type: text/event-stream and flush after each
 * write. The Hono streamSSE helper does this; if we ever see buffering,
 * the fallback is to switch to chunked NDJSON over plain HTTP — same
 * client logic, different content type.
 */
import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  runInContext,
  streamChatTurn,
  type ChatStreamEvent,
} from '@tela/capabilities';
import { contextFromAuthHeader, AuthError } from './auth.js';
import { logger } from './logger.js';

/**
 * Attachment payload from the client. Only the row id (photoId / itemId)
 * crosses the wire — the server resolves URLs / descriptions at use time
 * (signed download URL for photos; SELECT against closet_items for
 * wardrobe items). Prevents URL forgery and keeps the schema light.
 */
const attachmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image'), photoId: z.string().uuid() }),
  z.object({ type: z.literal('wardrobe_item'), itemId: z.string().uuid() }),
]);

const inputSchema = z.object({
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().min(1).max(4000),
  locale: z.string().default('en'),
  /** Up to 10 attachments per message. Undefined for the common text-only path. */
  attachments: z.array(attachmentSchema).max(10).optional(),
});

export function mountChatStream(app: Hono): void {
  app.post('/chat/stream', async (c: Context) => {
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
        // Run the WHOLE iteration inside runInContext so the AsyncLocalStorage
        // context is unambiguously active across every yield boundary. The
        // earlier shape (`runInContext(...) => generator; for await outside`)
        // intermittently dropped context when streamChatTurn fanned out tool
        // calls via Promise.all — Node's ALS propagation through generators
        // iterated *outside* their original run() is fragile, especially
        // when concurrent microtasks get interleaved.
        await runInContext(requestContext, async () => {
          for await (const event of streamChatTurn(parsed.data)) {
            await send(event);
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, userId: requestContext.userId }, 'chat stream failed');
        await send({ type: 'error', message });
      }
    });
  });
}
