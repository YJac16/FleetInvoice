# GO.md — FleetInvoice open-PR triage (read-only)

Read `docs/pr-triage/inputs.md` first. It is a fact snapshot (26 Nov 2026, SAST), not a verdict.

For each of the 29 open PRs on YJac16/FleetInvoice, fetch its head branch and inspect the diff vs its base and vs `origin/demo` and `origin/main`. Confirm or correct the inputs if a fact is stale.

Write `docs/pr-triage/verdict.md` with one table row per PR:

`# | title | verdict keep/close/merge-into-#N | reason | overlaps/superseded by | migrations that must ship with it`

Then a short section: recommended order to land the keepers on demo, and anything that needs Yaseen to decide.

Read-only on other branches and PRs: do not close, merge, comment, or push to them. Do not touch `main`, fyx, tggx, or prod Vercel.

Commit `verdict.md`, delete this `GO.md`, and push only branch `docs/pr-triage-2026-11-26`. Do not open a PR.
