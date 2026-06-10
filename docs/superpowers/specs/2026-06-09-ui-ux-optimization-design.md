# Design Spec: UI/UX Optimization & App Icon

**Date:** 2026-06-09
**Topic:** Modern & Bold UI Refresh

## 1. Overview
The goal is to unify and enhance the UI components (inputs, selects) to achieve a "grand" and professional aesthetic, and to create a modern app icon for `dbcli-gui`.

## 2. Design Direction: Modern & Bold
Following the user's preference for a "Modern & Bold" style.

### 2.1. Form Elements (Input & Select)
- **Dimensions:** Unified height of 40px (approx. `h-10`).
- **Typography:** `text-sm` (14px) instead of `text-xs`.
- **Padding:** `px-3 py-2`.
- **Background:**
  - Light mode: `bg-white` or very light slate `bg-slate-50`.
  - Dark mode: `bg-slate-800/40`.
- **Borders:** `border-slate-200` (Light) / `border-slate-700` (Dark).
- **Focus State:** `ring-2 ring-blue-500/20 border-blue-500`.
- **Transitions:** `transition-all duration-200`.

### 2.2. Connection Form Modal
- **Layout:** Use a cleaner grid for fields.
- **Grouping:** Group "Host" and "Port" horizontally.
- **Header/Footer:** Solid backgrounds with clear separation.

### 2.3. App Icon
- **Symbol:** A stylized three-layered database cylinder.
- **Colors:**
  - Primary: Blue (#2563eb).
  - Accents: Gradient shades of blue.
- **Style:** Modern flat with subtle shading for depth.

## 3. Implementation Plan
1. Update `src/components/ConnectionFormModal.tsx` with unified field styles and improved layout.
2. Update `src/views/Sidebar.tsx` search input to match the new style.
3. Update `scripts/make-icon.ts` to generate the new stylized database icon.
4. Verify changes using screenshots via `webapp-testing`.
