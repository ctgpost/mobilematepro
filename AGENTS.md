<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep interface language in one persistent client-side provider with an offline phrase catalog; translation must never alter form values or stored records.
- Place non-collapsible page-corner controls in PageHeader's cornerControl slot so they remain available independently of collapsed subtitle and actions.
- Any list, report, stat or backup that reads a user-facing table must load through `src/lib/fetchAll` (paginated) — plain `.select()` silently stops at Supabase Data API's 1000-row cap and shows missing data.
- Offline outbox items are never deleted for failing; after repeated failures they are paused for manual retry, so queued products/sales/ledger entries can't be lost.
