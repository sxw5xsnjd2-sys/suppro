# AGENTS.md

## Project Scope

- This file applies to the app in `suppro/`.
- Stack: Expo Router + React Native (JavaScript/JSX) + Supabase + Zustand.
- Current architecture (from recent commits): app code migrated from TS to JS, with a single TypeScript Supabase Edge Function at `supabase/functions/ai-supplement/index.ts`.

## Context Maintenance

- Codex may update this `AGENTS.md` file (add, edit, or remove lines) whenever relevant to keep project context accurate and up to date.
- Updates should be concise, factual, and consistent with the current codebase and decisions made in this repo.
- Existing guardrails in this file remain in effect unless you explicitly change them.

## Setup Commands

- Install deps: `npm install`
- Start dev server: `npm run start`
- Run iOS target: `npm run ios`
- Run Android target: `npm run android`
- Run web target: `npm run web`
- Lint: `npm run lint`
- Tests: no test runner is configured yet (`npm test` script does not exist).

## Code Style Rules

- Use JavaScript/JSX for app code (`.js` / `.jsx`) unless a file is already TypeScript (Edge Function).
- Use functional React components with hooks.
- Treat the homepage as the design reference for all screens; align new or updated UI with its visual system unless explicitly told otherwise.
- Keep imports using configured aliases when possible:
  - `@/*` for app-root paths
  - `@src/*` for `src/*`
- Follow existing style conventions:
  - double quotes
  - semicolons
  - `StyleSheet.create` with styles at file bottom
- Prefer theme tokens over hardcoded values:
  - `colors`, `spacing`, `radius`, `shadows`, `typography` from `theme/`
- Prefer reusing shared components before introducing screen-specific primitives.
- Extract repeated styles into shared tokens, theme values, or reusable components instead of duplicating them.
- Keep icons unchanged unless explicitly instructed to replace them.
- Preserve accessibility behavior and touch target sizing when updating UI.
- Keep date keys in local ISO format (`YYYY-MM-DD`) across stores and analytics logic.

## Framework Details

- Expo SDK 54 with `expo-router` file-based routing.
- Route groups:
  - tabs: `app/(tabs)/`
  - modals: `app/(modals)/`
- Global state:
  - `features/supplements/store.js` (persisted with AsyncStorage)
  - `features/health/store.js` (persisted with AsyncStorage)
  - `features/ai/store.js` (chat state)
- Data layer:
  - public Supabase client in `src/lib/supabase.js`
  - scoped Supabase client via `getScopedSupabase()` with `x-client-id` header
  - client identifier managed in `src/lib/clientId.js`
- AI summary backend:
  - Supabase Edge Function `ai-supplement`
  - configured in `supabase/config.toml`
  - OpenAI call is server-side only

## Build and Test Conventions

- Required local quality gate before shipping changes: `npm run lint`.
- Before redesigning remaining screens:
  - inspect the homepage implementation first
  - extract reusable homepage tokens into `theme/`
  - create and extend shared UI primitives before screen-by-screen restyling
  - preferred shared primitives include `AppHeader`, `GradientHeader`, `PrimaryCard`, `StatusPill`, `EvidenceDots`, `SectionTitle`, `AppButton`, and `EmptyStateCard`
- Since there is no automated test suite yet, run focused manual checks for changed flows:
  - home schedule/toggle taken
  - add/edit/delete supplement
  - supplement catalog search + user supplement creation
  - health metric add/log/delete
  - stats summary behavior (including fallback text)
- For web export builds, use Expo export flow (example): `npx expo export --platform web`.

## Guardrails (Do Not Change Without Explicit Approval)

- Preserve existing business logic and navigation flows when implementing UI changes.
- Do not change data models, Zustand stores, API calls, or Supabase contracts unless explicitly instructed.
- Do not break persisted store shape in AsyncStorage:
  - supplement fields (`id`, `catalogId`, `time`, `timeMinutes`, `daysOfWeek`, `startDate`, `endDate`, etc.)
  - `takenTimesByDate` keyed by `YYYY-MM-DD`
- Do not remove or bypass `getScopedSupabase()` or `getClientId()` when reading/writing `user_supplements`.
- Do not change `user-` prefixed ID semantics for user-sourced supplements.
- Do not rename route groups or modal paths used by router navigation (`/(tabs)`, `/(modals)`, `/modal/*`) without coordinated routing updates.
- Do not move OpenAI secrets to client code; `OPENAI_API_KEY` must stay server-side (Supabase function environment).
- Do not change the `ai-supplement` response contract without updating callers:
  - JSON object with `summary` and `recommendations` (array, max 4)
- Do not edit generated/runtime folders as part of feature changes:
  - `.expo/`, `dist/`, `node_modules/`, `supabase/.temp/`
