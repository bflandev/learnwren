---
name: slice-docs
description: Use when opening a new slice of work in Learn Wren — writing the design spec or the implementation plan, or when you need the file naming, the DRAFT banner, or the epic/use-case ID linkage for docs/superpowers.
---

# Slice Docs (Learn Wren)

Every slice opens with two commits, in this order, before any code:

```
docs(spec): <ID> <topic> slice design
docs(plan): <ID> <topic> implementation plan
```

## File naming (exact)

| Doc | Path |
|---|---|
| Spec | `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` |
| Plan | `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` — same date, same slug, **no `-design`** |

`<slug>` is kebab-case and carries the story ID when there is one: `2026-08-07-us-09-05-mobile-responsiveness`. Date = the day the doc is written, not the day the work lands.

## Spec shape

1. **DRAFT banner first**, before the H1 — copy it verbatim from any sibling spec (`> [!NOTE]` / `> **DOCUMENT STATUS: DRAFT**` / provisional line). Preserve it on every later edit unless the user is explicitly approving the document.
2. `# <ID>: <Title> — Slice Design`, then **Date**, **Story** (relative link into `docs/epics/NN-*.md#us-ee-nn`), **Status**.
3. **Why this slice** — including why the *other* open stories aren't it.
4. **Current state**, surveyed at a named commit, with `file:line` evidence. Counted facts, not impressions.
5. **Approach**, ordered. Say which part lands red first.

IDs are linked and must stay so: `EP-01` ↔ `docs/use-cases/01-*.md` ↔ `UC-01-NN`. A slice against an epic with no use-case file (EP-07/08/09) links the epic only.

## Plan shape

- Opens with the agentic-worker note pointing at `superpowers:subagent-driven-development`, then **Goal / Architecture / Tech Stack / Spec** (relative link back to the spec).
- **Global Constraints** — restate the worktree command with the concrete branch name, the never-`git add -A` rule, the gates that must stay green, and any invariant the slice can break (`--lw-*` token values, fixture field-verification, `vitest` doesn't typecheck).
- **File Structure** split Created / Modified / Renamed / Deleted, one line of purpose each.
- Tasks as `- [ ]` checkboxes, each with its own test-first step and a runnable verification command.
- Deviating from the spec mid-plan is fine — write a **Deviation from spec §N, flagged for review** blockquote where it happens rather than silently diverging.

## Common mistakes

| Mistake | Reality |
|---|---|
| Plan filename keeps `-design` | Spec and plan differ by that suffix alone. Getting it wrong hides the plan from the pair. |
| Editing a spec and dropping the DRAFT banner | Only the user approves a document. Keep the banner. |
| "Current state" from memory | Survey it, cite `file:line`, name the commit. Every plan built on a guess has missed a defect. |
| Writing the fix inventory into the spec | Declare the gate, not the guesses — US-09-03 found two defects nobody predicted. |
