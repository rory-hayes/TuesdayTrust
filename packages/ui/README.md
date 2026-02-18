# @evidenceq/ui

This package is the single source of truth for UI primitives and layout wrappers used by `apps/web`.

## Tailwind Plus integration workflow

1. Keep licensed Tailwind Plus source snippets in `packages/ui/tailwind-plus-kit` for reference only.
2. Copy the needed snippet structure into one of the curated components under `src/components/*`.
3. Adapt class names to EvidenceQ tokens in `src/styles/tokens.css` before merging.
4. Never import vendor kit files directly from app code.

## Where to paste Tailwind Plus components

- `src/components/page-shell.tsx` for app layout shells.
- `src/components/sidebar.tsx` for navigation variants.
- `src/components/topbar.tsx` for page headers and action bars.
- `src/components/button.tsx` for button variants.
- `src/components/input.tsx` for form controls.
- `src/components/table.tsx` for questionnaire lists.
- `src/components/status-pill.tsx` for state badges.
- `src/components/empty-state.tsx` for empty and onboarding blocks.
- `src/components/modal-shell.tsx` for dialogs/drawers.

## Rules

- Do not directly import or re-export raw Tailwind Plus vendor files.
- Curate and normalize each copied snippet to keep a stable API.
- Keep component APIs small and app-oriented to prevent UI sprawl.
