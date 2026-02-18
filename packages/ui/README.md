# @evidenceq/ui

This package is the single source of truth for UI primitives and layout wrappers used by `apps/web`.
The current wrappers are already backed by Catalyst (Tailwind Plus UI kit) primitives.

## Tailwind Plus integration workflow

1. Keep licensed Tailwind Plus source snippets in `packages/ui/tailwind-plus-kit` and `catalyst-ui-kit-golden-copy` for reference.
2. Update or add Catalyst primitives in `src/catalyst/*`.
3. Keep app-facing APIs stable by wrapping those primitives in `src/components/*`.
4. Never import vendor kit files directly from app code.

## Where to paste Tailwind Plus components

- Catalyst primitives live in `src/catalyst/*`.
- App-stable wrappers live in:
  - `src/components/page-shell.tsx`
  - `src/components/sidebar.tsx`
  - `src/components/topbar.tsx`
  - `src/components/button.tsx`
  - `src/components/input.tsx`
  - `src/components/table.tsx`
  - `src/components/status-pill.tsx`
  - `src/components/empty-state.tsx`
  - `src/components/modal-shell.tsx`

## Rules

- Do not directly import or re-export raw Tailwind Plus vendor files.
- Curate and normalize each copied snippet to keep a stable API.
- Keep component APIs small and app-oriented to prevent UI sprawl.
