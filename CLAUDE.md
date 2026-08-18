# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

NestJS 11 on TypeORM + Postgres. Two feature modules built out: **auth** (full) and **users** (minimal). Committed history exists — `master` has the initial import, feature work branches off it.

What exists: `config/config.module.ts` with fail-fast Zod env validation, TypeORM wired through `database/` with one applied migration (`CreateAuthTables`), the full cross-cutting set in `common/` (guards, interceptors, filters, decorators, Zod pipe), `api/v1/auth` + `api/v1/users`, and `shared/mailer/` sending over real SMTP via nodemailer.

What does not: any blog-post domain model. Adding one means copying the feature-module pattern — `api/v1/users/` is the smallest complete example, `api/v1/auth/` the fullest.

Sections marked *(planned)* describe agreed-but-unbuilt pieces.

## Architecture

The layout below is what is on disk. Adding a domain feature means copying the feature-module pattern — no changes to other layers.

```
src/
│
├── common/                          # Shared across ALL versions & modules
│   ├── decorators/
│   │   ├── api-paginated.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── public.decorator.ts
│   ├── dto/
│   │   ├── pagination.dto.ts        # Reusable query params (page, limit, sort)
│   │   └── id-param.dto.ts
│   ├── enums/
│   │   ├── role.enum.ts
│   │   └── status.enum.ts
│   ├── exceptions/
│   │   ├── base.exception.ts
│   │   └── http-exception.filter.ts # OWASP A05: never expose raw errors
│   ├── guards/
│   │   ├── jwt.guard.ts
│   │   ├── roles.guard.ts
│   │   └── throttle.guard.ts        # OWASP A04: rate limiting
│   ├── interceptors/
│   │   ├── response.interceptor.ts  # Wraps ALL responses in { data, meta }
│   │   ├── logging.interceptor.ts
│   │   └── timeout.interceptor.ts   # OWASP A04: prevent slow-loris
│   ├── middlewares/
│   │   ├── helmet.middleware.ts     # OWASP A05: security headers
│   │   ├── cors.middleware.ts
│   │   └── sanitize.middleware.ts   # OWASP A03: input sanitization
│   ├── pipes/
│   │   ├── validation.pipe.ts       # Global — strips unknown fields
│   │   ├── parse-uuid.pipe.ts
│   │   └── trim.pipe.ts
│   ├── traits/                      # API trait reusables (mixins)
│   │   ├── crud.trait.ts            # Mixin: generates CRUD endpoints
│   │   ├── soft-delete.trait.ts     # Mixin: adds softDelete logic
│   │   ├── auditable.trait.ts       # Mixin: createdBy, updatedBy
│   │   ├── searchable.trait.ts      # Mixin: full-text search pattern
│   │   └── exportable.trait.ts      # Mixin: CSV/Excel export
│   ├── types/
│   │   ├── express.d.ts             # Augments req.user
│   │   ├── pagination.type.ts
│   │   └── api-response.type.ts
│   └── utils/
│       ├── crypto.util.ts           # OWASP A02: hashing, token gen
│       ├── date.util.ts
│       └── string.util.ts
│
├── config/                          # App-wide config (validated at startup)
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   ├── throttle.config.ts           # OWASP A04: rate limit config
│   ├── security.config.ts           # helmet, cors, csp settings
│   └── config.module.ts             # Loads & validates all configs
│
├── database/                        # DB layer — separate from business logic
│   ├── migrations/
│   ├── seeders/
│   ├── subscribers/                 # TypeORM event hooks
│   └── database.module.ts
│
├── api/                             # All versioned API surface lives here
│   │
│   ├── v1/
│   │   ├── v1.module.ts             # Registers all v1 modules
│   │   │
│   │   ├── auth/
│   │   │   ├── controllers/
│   │   │   │   └── auth.controller.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── register.dto.ts
│   │   │   │   └── refresh-token.dto.ts
│   │   │   ├── guards/
│   │   │   │   └── local.guard.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── local.strategy.ts
│   │   │   ├── services/
│   │   │   │   └── auth.service.ts
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── users/
│   │   │   ├── controllers/
│   │   │   │   └── users.controller.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   ├── update-user.dto.ts
│   │   │   │   └── user-response.dto.ts  # Never return raw entities
│   │   │   ├── entities/
│   │   │   │   └── user.entity.ts
│   │   │   ├── repositories/
│   │   │   │   └── user.repository.ts    # Repo pattern = testable
│   │   │   ├── services/
│   │   │   │   └── users.service.ts
│   │   │   └── users.module.ts
│   │   │
│   │   └── products/                # Add any domain module the same way
│   │       ├── controllers/
│   │       ├── dto/
│   │       ├── entities/
│   │       ├── repositories/
│   │       ├── services/
│   │       └── products.module.ts
│   │
│   └── v2/
│       ├── v2.module.ts             # Registers all v2 modules
│       │
│       └── users/                   # Only override what changes
│           ├── controllers/
│           │   └── users.controller.ts  # New endpoints or breaking changes
│           ├── dto/
│           │   └── user-response-v2.dto.ts
│           ├── services/
│           │   └── users.service.ts     # Extends v1 service if needed
│           └── users.module.ts
│
├── shared/                          # Reusable business-layer classes
│   ├── base/
│   │   ├── base.entity.ts           # id, createdAt, updatedAt, deletedAt
│   │   ├── base.service.ts          # Generic CRUD<T> service
│   │   ├── base.repository.ts       # Generic repo with find/paginate
│   │   └── base.controller.ts       # Generic controller wires traits
│   ├── mailer/
│   │   ├── mailer.service.ts
│   │   ├── templates/
│   │   └── mailer.module.ts
│   ├── storage/
│   │   ├── storage.service.ts       # S3 / local adapter
│   │   └── storage.module.ts
│   └── queue/
│       ├── queue.service.ts
│       └── queue.module.ts
│
├── app.module.ts                    # Root — wires config, db, api/v1, api/v2
└── main.ts                          # Bootstrap: helmet, versioning, swagger, pipes
```

Layer rules that matter:

- **`common/` is the cross-cutting layer** — guards, interceptors, pipes, filters, middlewares, decorators, plus shared types and utils. It depends on NestJS, so it is *not* import-anywhere-safe the way a pure-types folder would be. Keep `types/`, `enums/`, and `utils/` free of Nest imports so the leaf modules stay cycle-proof even though the folder as a whole is not.
- **Cross-cutting behavior lives in `common/`; features never reimplement it.** `response.interceptor.ts` wraps every response, and the global validation pipe strips unknown fields from all incoming bodies — so controllers must not hand-roll response shaping or input sanitizing.
- **`api/` holds every route.** A folder per version, a folder per feature inside it, and each feature splits into `controllers/ dto/ entities/ repositories/ services/`. Nothing outside `api/` declares a controller.
- **`shared/` is the reusable business layer** — generic base classes plus infrastructure services (mailer, storage, queue). Infrastructure modules must not be re-instantiated per feature; import the module, inject the service.
- **`database/` owns schema concerns only** — migrations, seeders, subscribers. No business logic.
- **`config/` keeps security-sensitive settings in their own files** (`jwt.config.ts`, `security.config.ts`) so they can be audited in isolation.

### `api/v1/` is a source folder, not a URL segment

Easy to conflate, and getting it wrong produces `/api/v1/v1/users`. The folder decides where code lives; the **URL version still comes from the controller decorator**:

```ts
// file: src/api/v1/users/controllers/users.controller.ts
@Controller({ path: 'users', version: '1' })   // → /api/v1/users
```

`setGlobalPrefix` supplies `api`, `enableVersioning` supplies `v1`. The folder name never appears in a route.

### Feature module pattern

```
api/v<n>/<feature>/
├── controllers/    <feature>.controller.ts — routes, guards, Swagger decorators
├── dto/            create-<feature>.dto.ts, update-<feature>.dto.ts, <feature>-response.dto.ts
├── entities/       <feature>.entity.ts — extends BaseEntity
├── repositories/   <feature>.repository.ts — wraps the ORM repo
├── services/       <feature>.service.ts — business logic
└── <feature>.module.ts
```

Register the module in that version's `v<n>.module.ts`, not in `AppModule` — `AppModule` imports only `V1Module`, `V2Module`, and the infrastructure modules.

**Separation rule, strictly enforced:** controllers contain no business logic; services contain business logic only; repositories contain all DB queries. Removing a feature should be `rm -rf` on its folder plus one line out of its version module.

### Versioning a feature: copy, don't inherit

`api/v2/` holds only what actually changed. Everything else keeps serving from v1.

The tree marks `v2/users/services/users.service.ts` as "extends v1 service if needed" — treat that as a last resort. Cross-version inheritance couples the two: a change to the v1 service silently alters v2 behavior, which is the exact thing versioning exists to prevent. Prefer extracting shared logic into `shared/base/` or a version-neutral service, and let each version's service compose it.

### Deviations from the reference tree

Four places where the code differs from the structure diagram, each on purpose:

- **`common/common.module.ts` exists** though the tree shows no module there. The global `APP_GUARD` / `APP_INTERCEPTOR` / `APP_FILTER` registrations and `ThrottlerModule.forRootAsync` need a module to live in; putting them here keeps `AppModule` down to four imports.
- **`common/constants/` is kept.** `auth.constants.ts` holds `BCRYPT_ROUNDS`, consumed by `common/utils/crypto.util.ts`, so it cannot move into a feature folder without inverting the dependency.
- **`api/v1/auth/guards/refresh-token.guard.ts`** rather than `common/guards/` — it is auth-specific and nothing else uses it. `common/guards/` holds only the three genuinely global guards.
- **Class names kept where the tree only renamed files.** `validation.pipe.ts` still exports `ZodValidationPipe` (a bare `ValidationPipe` collides with Nest's built-in), and `http-exception.filter.ts` still exports `AllExceptionsFilter` (it is `@Catch()` with no argument — it catches everything, not just `HttpException`). `transform.interceptor.ts` → `response.interceptor.ts` did rename its class to `ResponseInterceptor`, since that name stayed accurate.

Not yet built: `common/traits/`, `common/dto/`, `common/middlewares/`, `common/decorators/api-paginated.decorator.ts`, `database/seeders/`, `database/subscribers/`, `shared/base/` generics (only `base.entity.ts` exists), `shared/storage/`, `shared/queue/`, `api/v2/`.

**`BaseEntity` has no `deletedAt`.** The reference tree lists one, but adding it changes the schema for every table and turns on soft-delete semantics — a behavioural change, not a move. It was deliberately left out of the restructure; add it with a migration when soft-delete is actually wanted.

**Validation stays Zod, not Joi.** `config/env.validation.ts` and every DTO use Zod, schemas compose via `z.infer`, and the pipe depends on Zod's strip-unknown-keys behavior. Do not swap it without a deliberate decision.

### Security expectations

| Concern | Mechanism | Where |
|---|---|---|
| Authentication | JWT access + refresh tokens | `api/v1/auth/strategies/` |
| Authorization | RBAC | `common/guards/roles.guard.ts` |
| Rate limiting | Per-route throttling | `common/guards/throttle.guard.ts` |
| Input validation | Strict schema, unknown fields stripped | `common/pipes/validation.pipe.ts` |
| HTTP headers | Helmet | `main.ts` |
| CORS | Allowlist origins | `config/security.config.ts` |
| Secrets | Env vars only | `.env` + `config/*.config.ts` |
| Errors | Never leak stack traces | `common/exceptions/http-exception.filter.ts` |
| Password hashing | bcrypt, cost 12 | `common/utils/crypto.util.ts` |

`main.ts` wires: `helmet()`, `enableCors(security.cors)`, `setGlobalPrefix('api')`, `enableVersioning(...)`, and the body cap / trust-proxy hops read from `security.config.ts`. Global filters/interceptors/guards are registered via `APP_*` tokens in `CommonModule`, not from `main.ts`.

Root-level env files: `.env`, `.env.example`, `.env.test` *(not yet created)*. **Only `.env.example` gets committed** — `.gitignore` already covers the rest.


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
npm run migration:generate -- src/database/migrations/<Name>
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
