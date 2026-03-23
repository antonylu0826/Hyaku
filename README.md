# Hayku Agent

An autonomous enterprise software construction agent that builds, remembers, and evolves.

Hayku is a self-directed agent that constructs enterprise software systems — identity services, audit trails, APIs, internal tools — while maintaining persistent memory and self-generating its own toolchain.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Hayku Agent Core               │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Planner │  │ Executor │  │  Memory   │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  │
│       │            │              │         │
│  ┌────▼────────────▼──────────────▼─────┐   │
│  │         Tool Manager                 │   │
│  │  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ Built-in │  │  Self-generated  │  │   │
│  │  │  Tools   │  │     Tools        │  │   │
│  │  └──────────┘  └───────┬──────────┘  │   │
│  │                    ┌───▼───┐          │   │
│  │                    │Security│         │   │
│  │                    │ Gate   │         │   │
│  │                    └───────┘          │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │       Model Router                   │   │
│  │  Claude / GPT / Gemini / Local LLM   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Services

### hayku-identity

Enterprise identity and access management service.

- **Stack**: TypeScript + Hono + Drizzle ORM + PostgreSQL
- **Port**: 3100
- **Features**:
  - User registration & login (bcrypt + JWT)
  - Refresh token rotation (auto-revoke on reuse)
  - Password reset (token-based, anti-enumeration)
  - API Key management (`hk_` prefixed, SHA-256 hashed)
  - Unified auth middleware (JWT + API Key)
  - Organization / Department / Member management
  - Role-Based Access Control (RBAC)
  - Production-safe config (env vars required in prod)

### hayku-audit

Enterprise audit logging service.

- **Stack**: TypeScript + Hono + Drizzle ORM + PostgreSQL
- **Port**: 3200
- **Features**:
  - Single and batch event ingestion (up to 1000/batch)
  - Query with filters (actor, action, resource, service, outcome, time range)
  - Pagination support
  - API Key authentication (validates against hayku-identity)

### @hayku/audit-client

Shared SDK for writing audit logs.

- Zero external dependencies
- Buffered batch writes with configurable flush interval
- Silent failure mode for non-critical audit paths
- Flush mutex to prevent race conditions
- Failed event requeue with memory cap (10,000 events max)

## Agent Infrastructure

### Memory System (`.hayku/memory/`)

Persistent cross-conversation knowledge store:
- `projects/` — Project context, requirements, architecture
- `decisions/` — Key decisions with rationale
- `learnings/` — Lessons learned, best practices

### Self-Generated Tools (`.hayku/tools/`)

Hayku builds its own tools as needed:
- **security-scanner** — Static analysis for code security (eval, SQL injection, hardcoded secrets)
- **api-tester** — HTTP API test runner with variable capture and assertions

### Security Gate

All tool creation and installation must pass:

1. **Static analysis** — Forbidden patterns (eval, SQL concatenation, hardcoded secrets, command injection)
2. **Dependency audit** — CVE scanning, typosquatting check, maintenance status
3. **Permission verification** — Least-privilege principle, declared vs actual permissions
4. **Human approval** — Required for Level 2+ tools

| Level | Scope | Policy |
|-------|-------|--------|
| 0 | Pure computation | Auto-approve |
| 1 | Read operations | Log + notify |
| 2 | Write operations | User confirmation required |
| 3 | System operations | Explicit user approval with risk disclosure |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

```bash
# Start identity database
cd workspace/hayku-identity
docker compose up -d
npm install
npm run db:generate
npm run db:push

# Start identity service
npx tsx src/index.ts
# → http://localhost:3100

# Start audit database
cd workspace/hayku-audit
docker compose up -d
npm install
npx drizzle-kit push

# Start audit service
npx tsx src/index.ts
# → http://localhost:3200
```

### Quick Test

```bash
# Health check
curl http://localhost:3100/health

# Register
curl -X POST http://localhost:3100/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test12345","displayName":"Test"}'

# Login
curl -X POST http://localhost:3100/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test12345"}'
```

## Project Structure

```
├── .hayku/                  # Agent brain
│   ├── memory/              # Persistent knowledge
│   ├── tools/               # Self-generated tools
│   ├── config/              # Model routing config
│   └── logs/                # Audit trail
├── packages/
│   └── audit-client/        # @hayku/audit-client SDK
├── workspace/
│   ├── hayku-identity/      # Identity & access service
│   └── hayku-audit/         # Audit log service
├── CLAUDE.md                # Agent system instructions
└── PLAN.md                  # Architecture & roadmap
```

## License

Private — All rights reserved.
