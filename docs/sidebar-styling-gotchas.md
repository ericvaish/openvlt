# Sidebar Styling Gotchas

## Overriding shadcn sidebar button backgrounds

### The problem

`SidebarMenuButton` and `SidebarMenuSubButton` (from `components/ui/sidebar.tsx`) control their background via the `isActive` prop, which sets `data-active` on the DOM element. The component's base class includes `data-active:bg-sidebar-accent` which provides the background color when active.

If you try to apply a custom background (e.g. multi-select highlight) without setting `isActive`, the button will have no background, only classes you add via `className`. This is why folders had no background when selected but files did: files passed `isActive={isActive}` while folders didn't pass `isActive` at all.

### What does NOT work

1. **Tailwind `!important` background classes** (`bg-primary/10!`): Loses to the component's internal `data-active:bg-sidebar-accent` due to CSS cascade order in Tailwind v4.

2. **Inline `style` prop**: Unreliable because the button is often wrapped in Radix `Slot` components (via `ContextMenuTrigger asChild`) where style merging across multiple layers can fail.

3. **Global CSS with `!important`** targeting custom data attributes: The data attribute doesn't reliably reach the DOM element through the Radix Slot chain.

### What DOES work

Use the sidebar component's own `isActive` prop to control the background highlight, and use `className` only for the ring:

```tsx
// Single unified highlight class for ring styling
const highlightClass = isNodeSelected
  ? selectClass     // ring-1 ring-inset ring-primary/30 ...
  : isItemActive
    ? activeClass   // same ring style
    : ""

// Pass isActive to control the background via the sidebar component's own mechanism
<Btn
  isActive={isActive || isNodeSelected || isItemActive}
  className={highlightClass}
>
```

This works because:
- The sidebar component handles its own background via `data-active:bg-sidebar-accent`. Setting `isActive={true}` triggers it consistently for both folders and files.
- We only use `className` for the ring, which the sidebar component has no competing styles for.
- Everything is defined in one place (`highlightClass`) so tweaking the ring style once updates all item types (folders, notes, notes-with-children).

### Key principle

Don't fight shadcn component internals. Use `isActive` for background control (the component's own mechanism) and `className` only for styles the component doesn't manage (ring, rounded corners).
