# EvidenceQ Design Spec (MVP)

## 1) IA Contract (Do Not Expand)
The app IA is intentionally constrained to four routes:
1. `/clients`
2. `/clients/[clientId]`
3. `/projects/[projectId]`
4. `/account`

No additional top-level pages are allowed for MVP.

## 2) Primary Navigation Model
- Primary left navigation targets consultant workflows, not end-customer portals.
- `/clients` is default home context.
- `/clients/[clientId]` contains in-page tabs only:
  - KB Vault
  - Questionnaires
- `/projects/[projectId]` is the questionnaire execution workspace.
- `/account` contains Team + Retention/Delete controls. Billing is deferred.

## 3) UI System Rules
- `packages/ui` provides all baseline primitives:
  - `PageShell`, `Sidebar`, `Topbar`
  - `Button`, `Input`
  - `Table`, `StatusPill`, `EmptyState`
  - `ModalShell` (optional drawer/dialog shell)
- Tailwind Plus UI kit is the primary visual source.
- Licensed kit code is pasted into curated wrapper components, never imported directly from vendor folders.
- Token usage should reference `packages/ui/src/styles/tokens.css`.

## 4) Visual Principles
- Bias toward consultant productivity and scanability.
- Keep high-signal status cues for draft/approved/insufficient evidence.
- Use concise, operational copy over marketing copy.
- Design for large tabular content and review workflows first.

## 5) Citation UX Requirements
- Each drafted answer must expose one or more citation anchors.
- Citation anchors support: `doc`, `page`, `section`, `sheet`, `cell`.
- If no citation is available, answer status cannot become complete.
- “Insufficient evidence” is first-class and must be visibly distinct from approved answers.
- Gap creation for insufficient evidence must be obvious in project workspace states.

## 6) Route-by-Route MVP UI Expectations
### `/clients`
- Table/list of client workspaces.
- Fast entry points to client workspace and current questionnaire project.

### `/clients/[clientId]`
- KB Vault section for uploaded evidence docs.
- Questionnaire list section (XLSX projects only for MVP).

### `/projects/[projectId]`
- Questionnaire row workspace with status per question.
- Draft answer + citation status visibility.
- Gap visibility for insufficient evidence rows.
- Export CTA for answered XLSX.

### `/account`
- Team membership and roles (minimal MVP handling).
- Data retention/delete controls.
- Billing explicitly marked as later.

## 7) Do-Not-Add List
- No onboarding wizard pages.
- No trust-center/public profile pages.
- No API keys page.
- No separate evidence-pack page in MVP.
- No complex reporting dashboard page in MVP.

