# Design Spec: Editor UI Refresh (Modern Bold)

**Date:** 2026-06-09
**Topic:** Editor Interface Optimization

## 1. Overview
The goal is to modernize the SQL editor area with a "Modern Bold" aesthetic, featuring a vertical sidebar for actions, unified button styling, and consistent SVG icons.

## 2. Design Direction: Modern Bold (Approach A)
Following the user's preference for Approach A.

### 2.1. Layout: Side Toolbar
- **Structure:** SQL Textarea on the left, Action Toolbar on the right.
- **Alignment:** The toolbar should be perfectly aligned with the top and bottom of the textarea.
- **Spacing:** `gap-3` between the textarea and the toolbar.

### 2.2. Component: Action Toolbar
- **Run Button:**
  - **Style:** `bg-blue-600` (Light) / `bg-blue-500` (Dark), `rounded-lg`, `shadow-sm`.
  - **Icon:** `Play` SVG from `lucide-react`.
  - **Size:** Bold padding, approx `h-10`.
- **Export Button:**
  - **Style:** `border border-slate-200` (Light) / `border-slate-700` (Dark), `rounded-lg`.
  - **Icon:** `Download` SVG from `lucide-react`.
  - **Structure:** Replace the raw select with a more polished button-like container that houses the icon and the dropdown.

### 2.3. SVG Icons
- Use `lucide-react` for all icons.
- No emojis allowed in the UI.

## 3. Implementation Plan
1. Refactor `src/views/Editor.tsx` to handle the side toolbar layout.
2. Update `src/views/ExportButton.tsx` to match the new "Modern Bold" style.
3. Polish the main `App.tsx` container to ensure correct height and spacing for the editor area.
4. Verify using `webapp-testing` screenshots.
