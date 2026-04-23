#!/usr/bin/env node
/**
 * Tela MCP server (stdio transport).
 *
 * Exposes a curated, READ-ONLY subset of the capability registry as MCP tools.
 * Mutations are intentionally excluded for now — the MCP server runs locally on
 * a developer's machine without any auth, so write operations are not safe yet.
 *
 * Usage in Claude Desktop's claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "tela": {
 *         "command": "doppler",
 *         "args": ["run", "--", "node", "/path/to/tela/apps/mcp/dist/index.js"]
 *       }
 *     }
 *   }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getAllCapabilities, type RegisteredCapability } from '@tela/capabilities';
import { z } from 'zod';

// Import capability registrations
import '@tela/capabilities';

// ─── Config: which capabilities are safe to expose ───
//
// Read-only capabilities. Add new entries here as more capabilities prove safe
// and useful for an unattended MCP context.
const READ_ONLY_TOOLS = new Set([
  'wardrobe.getItem',
  'wardrobe.listItems',
  'profile.get',
  'outfit.get',
  'outfit.list',
  'capability.list',
]);

const SAFE_CAPABILITIES: RegisteredCapability[] = getAllCapabilities().filter((c) =>
  READ_ONLY_TOOLS.has(c.name),
);

// ─── Convert capability → MCP tool ───
function capabilityToTool(capability: RegisteredCapability) {
  // Convert Zod schema → JSON Schema for MCP
  // The MCP SDK expects a JSON Schema input shape, so we use a simple translator.
  const inputSchema = zodToJsonSchema(capability.inputSchema);

  return {
    name: capability.name.replace(/\./g, '_'),
    description: capability.description,
    inputSchema,
  };
}

// Minimal Zod → JSON Schema converter for our own schemas.
// Doesn't cover every edge case — just the shapes we use in capabilities.
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(fieldSchema);
      if (!fieldSchema.isOptional()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element as z.ZodType) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType as z.ZodType);
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap() as z.ZodType);
    return { ...inner, nullable: true };
  }
  return {};
}

// ─── Server setup ───

const server = new Server(
  {
    name: 'tela',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: SAFE_CAPABILITIES.map(capabilityToTool),
  };
});

// Execute a tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const requestedName = request.params.name;
  // Reverse the underscore-encoding from capabilityToTool
  const capabilityName = requestedName.replace(/_/g, '.');

  const capability = SAFE_CAPABILITIES.find((c) => c.name === capabilityName);
  if (!capability) {
    return {
      content: [
        {
          type: 'text',
          text: `Unknown or unauthorized tool: ${requestedName}. Use list_tools to see available tools.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await capability.execute(request.params.arguments ?? {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with stdio protocol on stdout
  console.error(
    `[tela-mcp] connected. ${SAFE_CAPABILITIES.length} read-only tools exposed.`,
  );
}

main().catch((err) => {
  console.error('[tela-mcp] fatal:', err);
  process.exit(1);
});
