# VentureLake

Matchmaking-to-execution engine for founders. MVP foundation (Phase 1 scaffolding).

## Stack

- **Frontend:** React + Vite (TypeScript)
- **Backend:** Express (Node, TypeScript)
- **ORM / DB:** Prisma over PostgreSQL
- **Auth:** Backend-owned JWT (Bearer token)

## Architectural laws

1. The backend API is the only source of truth for business logic.
2. The frontend never writes business data directly to the database — it only calls backend API endpoints.
3. State transitions are server-side only.
4. One model owns one concern.

## Getting started

```bash
# 1. Install all dependencies (root + backend + frontend)
npm run install:all

# 2. Configure env
cp .env.example backend/.env        # then set DATABASE_URL + JWT_SECRET
cp frontend/.env.example frontend/.env

# 3. Generate the Prisma client + run the initial migration
#    (requires a reachable PostgreSQL instance)
npm run prisma:generate
npm run prisma:migrate

# 4. Run both apps together
npm run dev
```

- Backend: http://localhost:4000 (health check at `/health`)
- Frontend: http://localhost:5173

## Project layout

```
venturelake/
├─ package.json          # root scripts to run both apps
├─ .env.example
├─ frontend/             # React + Vite
└─ backend/              # Express + Prisma
   └─ prisma/schema.prisma   # FULL data model (Section 5), defined up front
```

## Status

Phase 1 — Foundation. Scaffolding only; **no business logic implemented yet.**
Route files and page stubs exist and compile, ready for later phases.
