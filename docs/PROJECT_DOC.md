# PROJECT DOC

Last updated: 2026-03-12

## Project Purpose

This repository contains an internal ERP web application for production operations, HR workflows, reporting, and role-based management in a factory environment.

## Scope Covered

- Authentication and account lifecycle.
- Dynamic roles and permissions (RBAC).
- Production management (products, lines, plans, reports).
- Dashboards for different organizational roles.
- HR domain (attendance, leaves, loans, payroll, approval flows).
- System administration (settings, users, activity logs).

## Main Technologies

- Frontend: React, TypeScript, Vite
- State Management: Zustand
- Routing: React Router
- Backend Services: Firebase (Auth, Firestore, Storage, Functions)
- Reporting/Export: Recharts, xlsx, jsPDF, html2canvas, react-to-print

## Architecture Standard

The project follows a modular layered architecture:

1. UI Layer (`modules/*/pages`, `components/*`)
2. Application Layer (`store/useAppStore.ts`, orchestrators/use-cases)
3. Service Layer (`modules/*/services`, `services/*`)
4. Data Layer (Firebase Auth/Firestore/Storage)

Golden flow:

`UI -> Store/UseCase -> Service -> Firebase`

## Coding Methodology

### 1) Structure by domain
- Features are grouped under `modules/<domain>`.
- Each domain should keep its own pages, services, types, and routes.

### 2) Strict separation of concerns
- UI components do rendering and interaction only.
- Business logic stays in store/use-cases/services.
- Firestore access is isolated in service files.

### 3) Type-safe development
- Prefer explicit TypeScript interfaces/types.
- Avoid untyped payloads between layers.

### 4) Reuse before create
- Reuse existing shared UI classes and components.
- Follow ERP-style page layout conventions used in this project.

### 5) Permission-aware implementation
- New actions/pages must be mapped to permissions.
- UI visibility and route access must respect RBAC rules.

### 6) Modal governance
- New modals must go through global modal manager.
- Modal keys are defined centrally and rendered via modal host.

## Development Workflow (Recommended)

1. Define feature scope and permission impact.
2. Add/update types.
3. Implement service operations.
4. Wire store/use-case orchestration.
5. Build UI with shared patterns.
6. Add route and sidebar integration if needed.
7. Validate lint/build and verify regressions.
8. Update docs/changelog when behavior changes.

## Current Project Status Reference

Use these files as source-of-truth snapshots:

- `PROJECT_STATUS.md` (execution status and gaps)
- `README.md` (operations and setup)
- `ARCHITECTURE.md` (architectural rules and flow)
- `MODAL_MIGRATION_TRACKER.md` (global modal migration progress)

## Onboarding Quick Start

1. Install dependencies: `npm install`
2. Create `.env.local` from `.env.example`
3. Run app: `npm run dev`
4. Read architecture docs before implementing features

## Documentation Owner Notes

When adding a new major feature, update at least:

- `README.md` (user/developer-facing overview)
- `PROJECT_STATUS.md` (delivery status)
- `ARCHITECTURE.md` (if architectural behavior changes)
