# TuesdayTrust — Design (UI/UX + Design System)

## 1) UX Principles
TuesdayTrust must feel:
- Calm
- Authoritative
- Precise
- Safe
- Human-in-control (no silent automation)

Avoid:
- “AI magic” vibes
- flashy gradients
- noisy dashboards
- hidden decisions

## 2) Information Architecture (Sidebar)
- Inbox (Questionnaires)
- Answer Library
- Evidence
- Analytics
- Settings
(Future gated modules: Trust Center)

## 3) Key Screens (End State)

### 3.1 Landing (marketing)
- Clear promise: “Governed answers for trust reviews.”
- CTA: Get started / Sign in
- Proof: ROI, time saved, confidence system, auditability

### 3.2 Upload Wizard (product)
Step-based wizard:
1) Choose ingestion path:
   - Upload questionnaire file (XLSX first)
   - Import prior completed questionnaires (bootstrap KB)
   - Import docs (later)
   - Start from templates
2) Upload file (signed URL)
3) Processing status (queued → parsing → matching)
4) Review readiness summary:
   - Auto-fill count
   - Needs review count
   - Manual count
5) Take me to Review

### 3.3 Questionnaire Inbox
Master-detail list:
- Status chips (queued, in review, completed, overdue)
- Percent complete
- Needs-review count
- Due date (optional)
- Filters: status, owner, due

### 3.4 Review Screen (core workflow)
Three-column layout:
- Left: question list (with filters for confidence bucket)
- Center: question + suggested answer + evidence
- Right: confidence panel + actions + audit/activity
Primary actions:
- Accept suggestion
- Edit (update canonical / create variant)
- New answer needed
- Add evidence link

Confidence is explainable:
- “Scope match: Product A ✓, Region EU ✓”
- “Used 17 times, last reviewed 42 days ago”

### 3.5 Answer Library
Default view:
- Grouped by domain (Access Control, Encryption, IR, etc.)
- Status chips (Draft / Approved / Deprecated)
- Search + filters (tag, scope, last reviewed)
Each answer detail:
- Canonical text
- Scope
- Variants
- Evidence links
- Usage stats
- Review history
- Audit log

### 3.6 Evidence
Evidence objects linked to answers:
- upload / link
- access control (internal/shareable)
- expiry/review date
- usage references

### 3.7 Analytics / ROI
- Time saved (transparent assumptions)
- Autofill rate trend
- Average completion time
- Reviewer load
- Confidence distribution

## 4) Design System: Catalyst Demo Defaults

We use **Catalyst** for 90% of components (layout, tables, forms, nav, modals).
The UI should match the Catalyst demo styling (neutral zinc palette + Inter typography).

### 4.1 Color Palette (locked)
- Use Catalyst defaults (zinc-based neutrals) rather than custom brand colors.
- Primary actions should use Catalyst button defaults (dark/zinc).

### 4.2 Typography
- Use Inter for body and UI text.
- Keep headings consistent with Catalyst defaults (no serif overrides).

### 4.3 Signature components (custom)
These define the product’s identity beyond Catalyst:
1) `ConfidenceBadge` (AUTO_FILL / NEEDS_REVIEW / MANUAL)
2) `AnswerCard` (status, owner, last reviewed, usage)
3) `ReviewQueueRow` (question + suggestion + actions)
4) `ScopeChip` (product/region/tier with mismatch states)
5) `ROITile` (time saved, completion time, autofill rate)

## 5) Copy Guidelines
- No hype, no “AI magic”.
- Use precise language:
  - “Suggested answer” not “AI answer”.
  - “Confidence” with explanation.
  - “You are in control. Nothing is submitted automatically.”
