/**
 * Tool catalog: turns chat-enabled capabilities into tool definitions the
 * AI can choose to invoke.
 *
 * - A capability becomes a tool when it sets `chatTool: true`.
 * - Admin-gated capabilities are filtered out unconditionally; admin tools
 *   should never be exposed to chat (the registry would also reject the
 *   call, but filtering at the catalog stops the model from even trying).
 * - The tool name is the capability name verbatim ('outfit.generate'). OpenAI
 *   accepts dotted names; we don't need to mangle them.
 * - The JSON schema is derived from the capability's Zod input schema via
 *   zod-to-json-schema; OpenAI requires draft-07 (or 2020-12 with their
 *   strict mode), and zod-to-json-schema's default produces something
 *   compatible.
 */
import * as Sentry from '@sentry/node';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDef } from '@tela/ai';
import { getAllCapabilities, executeCapability } from '../registry.js';
import type { RegisteredCapability } from '../types.js';
import { getRequestContext, runInContext } from '../context/requestContext.js';

/**
 * Build the list of tools the chat AI can call. Two modes:
 *
 * - Default (user chat): `chatTool && !requiresAdmin` — admin tools
 *   filtered out for defense in depth.
 * - With `includeAdmin: true` (admin chat, Phase 14c): `chatTool &&
 *   requiresAdmin` — admin tools ONLY. Admin chat is for operational
 *   queries about the system, not for using the system as a user, so
 *   user tools stay out of the admin catalog. Curation lives at the
 *   capability level (admin caps opt in via `chatTool: true`); we
 *   currently expose ~14 read-tools to mirror legacy's ADMIN_AI_TOOLS
 *   set. Write tools (create/update/delete prompt versions etc.) stay
 *   un-flagged so the AI can't mutate stylist content without a UI.
 *
 * Idempotent / cheap — safe to call per chat turn.
 */
export function buildToolCatalog(opts?: { includeAdmin?: boolean }): ToolDef[] {
  const adminMode = opts?.includeAdmin ?? false;
  return getAllCapabilities()
    .filter((c) => c.chatTool && (adminMode ? c.requiresAdmin : !c.requiresAdmin))
    .map(capabilityToToolDef);
}

function capabilityToToolDef(cap: RegisteredCapability): ToolDef {
  const jsonSchema = zodToJsonSchema(cap.inputSchema, {
    name: cap.name,
    target: 'openApi3',
    $refStrategy: 'none', // Inline everything — OpenAI handles inline schemas more reliably than $refs
  });

  // zod-to-json-schema with name returns { definitions: { [name]: schema } } —
  // unwrap to just the schema body.
  const definition =
    typeof jsonSchema === 'object' && jsonSchema !== null && 'definitions' in jsonSchema
      ? (jsonSchema as { definitions: Record<string, unknown> }).definitions[cap.name]
      : jsonSchema;

  return {
    name: cap.name,
    description: cap.description,
    parameters: (definition as Record<string, unknown>) ?? { type: 'object', properties: {} },
  };
}

export interface ToolDispatchResult {
  ok: boolean;
  result?: unknown;
  error?: { name: string; message: string };
}

/**
 * Execute a single tool call by name. Wraps the capability execution in the
 * current RequestContext so authorization + auditing keep working.
 *
 * Returns a normalized {ok, result, error} envelope so the chat loop can
 * always serialize a tool response back to the model — even on failure,
 * where we want the model to see the error and adjust rather than crash
 * the whole turn.
 */
export async function dispatchTool(
  name: string,
  args: unknown,
): Promise<ToolDispatchResult> {
  const ctx = getRequestContext();

  try {
    const result = await runInContext(ctx, () => executeCapability(name, args));
    return { ok: true, result };
  } catch (err) {
    // Capture before swallowing into the tool-result envelope. Without this,
    // tool exceptions are invisible to Sentry — the LLM sees a graceful
    // tool-error message and the operator never knows the tool blew up.
    // Tagged with the tool name + RequestContext source so admin-chat vs
    // user-chat vs MCP origin can be discriminated downstream.
    Sentry.captureException(err, {
      tags: {
        tool: name,
        source: ctx.source,
      },
      level: 'error',
    });

    const e = err instanceof Error ? err : new Error(String(err));
    return {
      ok: false,
      error: {
        name: e.name,
        message: e.message,
      },
    };
  }
}
