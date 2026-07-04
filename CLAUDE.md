# TimeWin24

TimeWin24 is the planning, employee, schedule, attendance, operational rights and
HR coordination SaaS. It may integrate with POS Caisse only where employee identity,
planning, presence, rights, cash-opening authorization or store operations are
directly linked. It must not become an accounting system.

## TimeWin24 execution protocol

Use the `information` skill for all TimeWin24 development work.

Default behavior:
- execute validated modules autonomously;
- enforce no duplicate events;
- audit planning, employee and rights-sensitive changes;
- validate through typecheck, lint, tests and build where applicable;
- stop only for real blockers;
- continue automatically to the next validated module.
