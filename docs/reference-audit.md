# Reference audit and v2 scope

Reference: https://greentimekids.lovable.app. Authenticated parent and child demo views inspected with user-provided access on October 18, 2026. No source-app records were changed. Demo credentials are not included in this repository.

## Observed reference

- Separate kid/parent registration and shared email/password sign-in.
- Kid view: greeting, screen-time balance, available tasks, completed cards.
- Parent view: linked-kid count, pending-review count, active-task count; Reviews, Tasks, Log, Kids tabs.
- Task editor: 15 emoji choices, title, description, kid instructions, Greenie completion criteria, minutes, category, assigned child, photo requirement, recurrence toggle.
- Categories: Chore, Outdoor Activity, Responsibility, Healthy Habit.
- Reviews: photo viewer, Greenie pass/fail explanation and confidence, status, Concur, Revoke, Return to Kid, Discard.
- Event log: child/task, decision, AI explanation, timestamp, reward label.
- Kids: linking code form, confirmed balance, app name/icon and blocked-vs-allowed rule.
- Styling: original logo, pale green background, white rounded cards, green primary buttons, friendly rounded headings.

## Observed discrepancy

The same linked child's dashboard displayed 15 minutes while the parent's Kids tab displayed 0 confirmed minutes. V2 replaces independent displayed totals with one ledger projection. The log shows actual signed credit deltas rather than labeling denied/discarded actions with a positive reward.

## Deliberate v2 additions and changes

- Screen-time requests with explicit parental approval and a session end time.
- Three milestone badges derived from approved submissions.
- AI assessments are advisory and explicitly requested by the parent, avoiding unverified automated credit grants.
- Archive tasks to retain submission history.
- Idempotent request receipts and state-aware approval/reversal logic.
- Daily recurrence is defined explicitly as once per UTC day. The reference did not reveal a recurrence schedule.
- Device blocking is labeled unconnected. Observing a rule editor does not establish operating-system enforcement.
- Kid linking code generation is implemented for unlinked accounts; the reference's linking dialog described this flow but the supplied kid was already linked.

## Not inferred from the reference

A fresh available-task submission screen was not reachable in the supplied kid's current state. The v2 photo/note flow follows the observed task and parent review fields. No source code, database policies, live device enforcement, or unseen routes were available to audit. This is a functional reconstruction of observed workflows, not a source-code migration or a claim of exhaustive parity.
