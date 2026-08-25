# Tela

An AI personal styling app. You photograph what you own, Tela catalogs and measures it, and an assistant
helps you decide what to wear and what to buy.

Built with a professional stylist as a collaborator. This is a personal project. It has never had users, and
nothing here is a company.

---

## The idea

Most styling apps ask you to do work before they do anything useful: an onboarding quiz, swipe-to-train,
endless preference sliders. Tela is built on the opposite bet. **Do the maximum amount of AI work and ask the
user for the minimum.** You take a photo. Everything else is the system's job.

That constraint drove most of the architecture below.

---

## How it's put together

A pnpm and Turborepo monorepo in TypeScript.

**Five applications**

| | |
|---|---|
| `apps/web` | The product. Next.js, tRPC client, Supabase auth. |
| `apps/admin` | Internal tooling, including an admin chat surface. Next.js. |
| `apps/api` | Hono server exposing the capability registry over tRPC. |
| `apps/workers` | Background jobs on pg-boss. Image processing and enhancement run here, not in a request. |
| `apps/mcp` | *Planned.* An MCP server to expose part of the registry to Claude and other agents. |

**Nine shared packages**, of which three matter: `capabilities` (the registry), `ai` (the model gateway), and
`db` (Drizzle over Postgres).

---

## Three decisions worth explaining

### 1. Every action is a capability, defined once

Rather than writing business logic separately for the web app, the admin tool, the API, and the agent
interface, there is one registry. Capabilities live in `packages/capabilities` across thirteen domains:
`wardrobe`, `item`, `outfit`, `tryon`, `profile`, `context`, `enhancement`, `chat`, `admin`, `auth`, `user`,
`storage`, `migration`.

Each one declares its own input schema in Zod and registers itself. Everything else is a consumer:

```
capability registry
   ├── tRPC        →  web app
   ├── tRPC        →  admin
   ├── HTTP        →  api
   └── MCP tools   →  Claude and other agents
```

The payoff is that adding a capability makes it available everywhere at once, including to an AI agent,
without writing a second implementation or a translation layer.

### 2. An agent interface should be a consumer, not a rewrite

The reason the registry is shaped this way is that I wanted adding an agent interface later to be a
configuration problem rather than a reimplementation.

That work is next. The plan is an MCP server that exposes a **curated, read-only subset** of the registry:
`wardrobe.getItem`, `wardrobe.listItems`, `profile.get`, `outfit.get`, `outfit.list`, `capability.list`. Every
mutation stays excluded, enforced with an allowlist rather than a denylist.

The read-only constraint is deliberate. An MCP server running locally on a developer machine has no auth in
front of it. An agent that can read your wardrobe is useful. An unauthenticated agent that can delete it is a
liability. Opening up writes should be a security decision made on purpose, so the default is closed.

Because each capability already carries its own Zod input schema, the translation to MCP tool definitions is
mechanical. That is the point of the registry.

### 3. Every model call is recorded with its cost

Calls do not go straight to a provider SDK. They go through a gateway in `packages/ai` that:

- abstracts the provider, so OpenAI and Anthropic are interchangeable at the call site
- checks rate limits before the call and again after it
- calculates the cost of every call from a pricing table
- writes each call, with provenance, to a `generations` table

This exists because a product whose thesis is "do the maximum AI work" has an economic ceiling, and you cannot
reason about that ceiling unless you can see per-feature spend. Instrumenting it early was cheaper than
retrofitting it later.

---

## Stack

TypeScript · Next.js · Hono · tRPC · Drizzle ORM · Postgres · Supabase (auth and storage) · pg-boss ·
Zod · OpenAI and Anthropic · Sentry · Railway · Model Context Protocol SDK *(planned)*

---

## What I'd do differently

The capability registry took longer to build than writing the first surface directly would have, and it only
started paying for itself once the third consumer existed. If I were starting again I would still build it,
but I would not build it first.

The bet it was making, that an agent interface would be cheap to add later, is still unproven. I will know
when the MCP server is done.

---

*Luke Gorski · [linkedin.com/in/lgorski1](https://www.linkedin.com/in/lgorski1)*
