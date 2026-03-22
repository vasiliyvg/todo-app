# Timeline Display Fix Design

**Date:** 2026-03-22
**Branch:** fix-timeline-display

## Problem

In `Timeline.tsx`, `todo.title` is rendered inside the 48×48px circular marker (`w-12 h-12`). Long titles are crammed into a tiny circle. The content area beside the circle only shows a formatted date.

## Fix

Single file change: `frontend/src/components/Timeline.tsx`

1. **Inside the circle** — replace `<span className="text-white font-semibold">{todo.title}</span>` with a small white dot: `<div className="w-3 h-3 bg-white rounded-full" />`

2. **In the content area** — add `<p className="text-sm text-gray-600">{todo.title}</p>` below the existing `<h3>` date line.

## Result

```
Before:
  [ Buy milk ]  ← title crammed in circle
  Jan 15, 2024

After:
  [  •  ]  ← white dot in circle
  Jan 15, 2024
  Buy milk      ← title in content area
```

## Testing

Existing `Timeline.test.tsx` tests still pass — title is still in the DOM, just in a `<p>` instead of a `<span>`. The `getByText('Release v1.0')` assertion remains valid. The count test uses `{ selector: 'span' }` — since titles move to `<p>`, this selector no longer matches titles. The count test must be updated to use `{ selector: 'p' }`.

## Scope

- Modify: `frontend/src/components/Timeline.tsx`
- Update: `frontend/src/components/Timeline.test.tsx` (fix selector in count test)
- No other files change
