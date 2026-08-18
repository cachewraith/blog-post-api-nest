# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

NestJS 11 on TypeORM + Postgres, with the layered layout below in place and one feature module built out: **auth**. Still no commits — every file is untracked.

What exists: `@nestjs/config` with fail-fast Zod env validation, TypeORM wired through `shared/database/`, the full `core/` cross-cutting set (guards, interceptors, filters, decorators, Zod pipe), and `modules/auth` + `modules/users`.

What does not: any blog-post domain model. Adding one means copying the feature-module pattern — `modules/users/` is the smallest complete example, `modules/auth/` the fullest.

Sections marked *(planned)* below describe agreed-but-unbuilt pieces. Everything else is on disk.

## Intended architecture

Five layers in `src/`, each with one responsibility. Adding a domain feature means copying the feature-module pattern — no changes to other layers.

```
src/
├── core/            # App-wide singletons, wired once via CoreModule
│   ├── guards/          jwt-auth, refresh-token, roles (RBAC), throttle
│   ├── interceptors/    logging, transform (response envelope), timeout
│   ├── filters/         all-exception
│   ├── decorators/      public, roles, current-user, response-message
│   ├── pipes/           zod-validation
│   └── core.module.ts
├── common/          # Pure TypeScript — no NestJS module deps, safe to import anywhere
│   ├── entities/        base.entity (id, createdAt, updatedAt)
│   ├── enums/           role, token-type
│   ├── interfaces/      jwt-payload
│   ├── utils/           hash, duration
│   └── constants/       auth.constants
├── config/          # One typed registerAs factory per concern
│   └── app · database · jwt · throttle · cors + env.validation.ts
├── modules/         # One folder per bounded context
│   ├── auth/            + strategies/ (jwt, refresh-token)
│   ├── users/           ← the template; copy it for every new feature
│   └── …
├── shared/          # Infrastructure modules, imported only where needed
│   ├── database/        + migrations/, data-source.ts (CLI only)
│   ├── mailer/          dev transport logs; swap `deliver` for SMTP
│   └── …                (planned) cache (Redis) · queue (BullMQ) · storage · logger
├── app.module.ts    # Root
├── app.controller.ts# Health check only (version-neutral)
└── main.ts          # Bootstrap
```

Layer rules that matter:

- **`common/` must stay free of NestJS module dependencies.** That's what makes it importable from anywhere without circular-dependency risk. Pure types, utils, and constants only.
- **`core/` holds cross-cutting behavior; features don't reimplement it.** `transform.interceptor.ts` wraps every response as `{ data, message, status }`, and the validation pipe strips unknown fields from all incoming bodies — so controllers should not hand-roll response shaping or input sanitizing.
- **`shared/` modules are infrastructure and must not be re-instantiated per feature** — import the module, inject the service.
- **`config/` keeps security-sensitive settings in their own files** (`jwt.config.ts`, `cors.config.ts`) so they can be audited in isolation.

### Feature module pattern

```
modules/<feature>/
├── dto/            create-<feature>.dto.ts, update-<feature>.dto.ts (partial of create)
├── entities/       <feature>.entity.ts — extends BaseEntity
├── repositories/   <feature>.repository.ts — wraps the ORM repo
├── <feature>.controller.ts   routes, guards, Swagger decorators
├── <feature>.service.ts      business logic
└── <feature>.module.ts
```

Scaffold with `nest g module modules/<feature>` (then `controller`, `service` with the same path prefix) — `nest-cli.json` sets `sourceRoot: src`, so the path is relative to `src/`.

**Separation rule, strictly enforced:** controllers contain no business logic; services contain business logic only; repositories contain all DB queries. Removing a feature should be `rm -rf` on its folder plus one line out of `AppModule`.

### Security expectations

| Concern | Mechanism | Where |
|---|---|---|
| Authentication | JWT access + refresh tokens | `modules/auth/strategies/` |
| Authorization | RBAC | `core/guards/roles.guard.ts` |
| Rate limiting | Per-route throttling | `core/guards/throttle.guard.ts` |
| Input validation | Strict schema, unknown fields stripped | `core/pipes/zod-validation.pipe.ts` |
| HTTP headers | Helmet | `main.ts` |
| CORS | Allowlist origins | `config/cors.config.ts` |
| Secrets | Env vars only | `.env` + `config/*.config.ts` |
| Errors | Never leak stack traces | `core/filters/all-exception.filter.ts` |
| Password hashing | bcrypt, cost 12 | `common/utils/hash.util.ts` |

`main.ts` wires: `helmet()`, `enableCors(corsConfig())`, `setGlobalPrefix('api')`, `enableVersioning(...)`, a 100kb body cap, and `trust proxy 1`. Global filters/interceptors/guards come from `CoreModule` via `APP_*` tokens, not from `main.ts`.

Root-level env files: `.env`, `.env.example`, `.env.test`. **Only `.env.example` gets committed** — `.gitignore` already covers the rest.

## API versioning — required for every route

Routes are versioned with Nest's URI versioning, **not** a hardcoded `api/v1` prefix:

- `main.ts` sets `setGlobalPrefix(API_PREFIX)` (`api`) and `enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION })`.
- Every feature controller declares its own version: `@Controller({ path: 'auth', version: '1' })`.
- Final shape: `/{API_PREFIX}/v{version}/{path}` → `/api/v1/auth/login`.

**Rule: never write `@Controller('thing')` bare.** Always `@Controller({ path: 'thing', version: '1' })`. The version belongs to the controller so a breaking change ships as a *new controller* (`@Controller({ path: 'auth', version: '2' })`) registered beside the old one — v1 keeps serving existing clients, and nothing global changes. A controller may also take `version: ['1', '2']` to serve both.

The health check is the one exception: `@Controller({ version: VERSION_NEUTRAL })` puts it at `/api/health` so probes never need updating when a version ships.

`API_PREFIX` and `API_DEFAULT_VERSION` are separate env vars for this reason — don't collapse them back into one `api/v1` string.

## Auth module (built)

All routes under `/api/v1/auth`, all `@Public()` (the global `JwtAuthGuard` is deny-by-default, so new routes are protected unless they opt out).

| Route | Body | Returns |
|---|---|---|
| `POST /register` | `first_name, last_name, email, phone_number, password, password_confirmation` | `requires_otp_verification` — **no tokens** |
| `POST /login` | `email, password` | token pair + user, or `requires_otp_verification` if unverified |
| `POST /verify-otp` | `email, otp` | token pair + user + `reset_token` |
| `POST /forgot-password` | `email` | fixed message, identical for unknown addresses |
| `POST /reset-password` | `reset_token, password, password_confirmation` | confirmation message |
| `POST /refresh` | `refresh_token` | rotated token pair |
| `POST /logout` | `refresh_token, all_devices?` | confirmation message |

Design decisions worth not re-litigating:

- **One OTP endpoint, no `purpose` column.** A code proves mailbox ownership and nothing else, so `verify-otp` both signs the user in and hands back a `reset_token`. Registration and password-reset share the identical code path.
- **`reset_token` is single-use via `User.credentialsChangedAt`,** not a token table. Completing a reset stamps that column; any token whose `iat` is at or before it stops verifying — which retires the spent reset token *and* every access/refresh token issued earlier. `TokenService.assertNotStale` is the single place this is enforced.
- **Three separate JWT secrets** (access / refresh / reset), each verified only against its own key, so token-type confusion fails at the signature.
- **Logout = refresh-token revocation.** Sessions live in `refresh_tokens`; logout revokes the row. The access token is deliberately *not* denylisted — it expires in 15 minutes, and a denylist would cost a store lookup per request. Refresh tokens rotate on every use, and replaying a superseded one revokes the whole family.
- **No user enumeration anywhere:** login runs a bcrypt compare against a dummy hash when the email is unknown, `forgot-password` always answers the same, register's 409 never says which field collided, and every OTP failure returns one message.

`MailerService` logs codes in development and is a no-op stub in production — bind a real SMTP transport in its `deliver` method before shipping.

## Local database

No Docker. Point `.env` at a Postgres you run yourself:

```bash
createdb blog_post_api          # matching DB_NAME / DB_USERNAME / DB_PASSWORD
npm run migration:run
```

`DB_SYNCHRONIZE` stays `false` — migrations own the schema, and it is ignored outright when `NODE_ENV=production`.

## Commands

```bash
npm run start:dev            # watch-mode dev server (port from $PORT, default 3000)
npm run build                # nest build → dist/ (deleteOutDir: true, so dist/ is wiped first)
npm run start:prod           # node dist/main — requires a prior build
npm run lint                 # eslint with --fix (mutates files)
npm run format               # prettier --write over src/ and test/
npm test                     # unit tests
npm run test:e2e             # e2e tests
npm run test:cov             # coverage → ./coverage
npm run migration:run        # apply migrations (needs a reachable Postgres)
npm run migration:revert     # roll back the last one
npm run migration:generate -- src/shared/database/migrations/<Name>
```

Single test / single file:

```bash
npm test -- src/app.controller.spec.ts       # one unit spec file
npm test -- -t 'getHello'                    # by test name
npm run test:e2e -- -t '/ (GET)'             # one e2e test
```

## Test layout — two separate Jest configs

- **Unit**: inline `jest` block in `package.json`, `rootDir: src`, matches `*.spec.ts`. Specs live beside the code they test. Paths passed to `npm test` are still repo-relative (`src/...`), not `rootDir`-relative.
- **E2E**: `test/jest-e2e.json`, `rootDir: .`, matches `*.e2e-spec.ts`. Boots the real app via `Test.createTestingModule` + `supertest`.

A spec placed under `test/` with a `.spec.ts` suffix is picked up by neither config. Match the suffix to the intended runner.

## Toolchain gotchas

- **Lint is type-aware.** `typescript-eslint` runs with `recommendedTypeChecked` and `projectService: true`, so lint errors can surface from type information, not just syntax. `no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` are warnings.
- **Prettier violations are ESLint errors** via `eslint-plugin-prettier/recommended`. Formatting failures break `npm run lint`. Style: single quotes, trailing commas, `endOfLine: auto`.
- **`module: nodenext` in `tsconfig.json`, but ESLint's `sourceType` is `commonjs`.** Nest compiles to CommonJS; keep to plain `import`/`export` and avoid ESM-only constructs like top-level `await` or `import.meta` in `src/`.
- **TypeScript is deliberately loose**: `noImplicitAny: false`, `strictBindCallApply: false`, and only `strictNullChecks` is on — full `strict` is off. Do not assume strict-mode diagnostics will catch mistakes.
- `emitDecoratorMetadata` + `reflect-metadata` are what make Nest's constructor DI work. Removing either breaks injection at runtime, not compile time.
