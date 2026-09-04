# Job Marketplace UX Specification

## Routes
- `/`: role selection with two entry points: Client / Post a Job, Worker / Browse Jobs.
- `/create-job`: client-only job creation and escrow setup.
- `/dashboard/client`: persisted client jobs, statuses, and review links.
- `/dashboard/worker`: available jobs, claimed work, and evidence submission links.
- `/jobs/[id]`: canonical job detail, progress rail, role-aware actions, protocol trace.

## State Model
`OPEN` (created, awaiting worker) → `CLAIMED` (worker assigned) → `IN_REVIEW` (evidence submitted and GenLayer request sent) → `COMPLETED` (PASS and bounty released) or `REFUNDED` (FAIL) or `REVIEW_REQUIRED` (UNDETERMINED/failed delivery).

## Persistence
Use localStorage as a demo continuity layer keyed by `genlayer-gateway.jobs.v1`. On-chain job IDs and request IDs are authoritative once known; local records are optimistic UI projections and must be reconciled by loading the detail page.

## Components
- `AppHeader`: brand, route navigation, testnet pill.
- `RoleCard`: short role explanation and single CTA.
- `StatusBadge`: maps protocol states to Open, Claimed, In Review, Completed, Refunded, Review Required.
- `ProgressRail`: four visible stages with current/complete/inactive semantics.
- `JobCard`: bounty, worker/client, status, next action.
- `ToastRegion`: `aria-live=polite`, success/error/info variants.
- `JobForm`: worker, bounty, task, policy, evidence expectations; one primary action.

## Empty and Error States
Every dashboard has a useful empty state with one CTA. Transaction errors remain inline and in toast. Wallet mismatch explains which role must sign. Pending GenLayer uses a calm waiting state and never implies failure.

## Acceptance Criteria
- A created job remains visible after navigation and refresh.
- Job detail can be opened from both dashboards.
- Primary actions identify the signing role and chain.
- Status badges contain human labels, not raw protocol codes.
- The detail page shows the four-stage rail and expandable technical trace.
- Mobile layout remains usable at 360px.

## Pre-Flight
- Identity lock: pass.
- Anti-slop rules: pass.
- State coverage: pass for open, claimed, review, completed, refunded, review-required, loading, empty, and error.
- Accessibility: pass by implementation checklist.
- Cognitive load: one primary action per card/page.
