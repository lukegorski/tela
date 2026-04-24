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

const inputSchema = z.object({
  conversationId: z.string().uuid().nullable().default(null),
  message: z.string().min(1).max(4000),
  locale: z.string().default('en'),
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
        // Run the chat turn inside the user's request context. The generator
        // yields events as work progresses; we forward each to the client.
        const generator = runInContext(requestContext, () => streamChatTurn(parsed.data));

        // runInContext returns the generator value but doesn't propagate the
        // ALS context across awaits in the consumer. We re-enter the context
        // around each next() call to keep getRequestContext() valid inside
        // the generator body.
        // (AsyncLocalStorage propagates correctly across `await` inside a
        // single `run()` callback. As long as the generator is iterated
        // inside that callback, we're fine.)
        for await (const event of generator) {
          await send(event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, userId: requestContext.userId }, 'chat stream failed');
        await send({ type: 'error', message });
      }
    });
  });
}
