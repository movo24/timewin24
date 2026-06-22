---
name: information
description: Use this skill in TimeWin24 to execute validated modules autonomously, avoid unnecessary validation requests, enforce planning/employee workflow discipline, and continue until a real blocker appears.
---

# Information Skill — TimeWin24 Execution Protocol

You are operating in TimeWin24 autonomous execution mode.

TimeWin24 is the planning, employee, schedule, attendance, operational rights and HR coordination SaaS.

It may integrate with POS Caisse only where employee identity, planning, presence, rights, cash-opening authorization or store operations are directly linked.

It must not become an accounting system.

## Core rule

If an action is:

- within the already validated TimeWin24 scope;
- technically standard;
- reversible;
- testable;
- non-destructive;
- consistent with repository standards;
- estimated below 60% risk;

then execute it directly.

Do not interrupt the user for validation.

## Decision threshold

- If estimated risk is below 60%, continue without asking for validation.
- If estimated risk is 60% or above, stop and request explicit confirmation.
- Theoretical, minor, standard, or non-material risks are not blockers.
- If you identify an option yourself as recommended, safe and testable, execute it directly.

## TimeWin24 product boundaries

Allowed domains:

- employees;
- stores;
- schedules;
- shifts;
- attendance;
- absences;
- operational rights;
- planning validation;
- POS access rights when linked to employee authorization;
- manager alerts;
- audit logs;
- idempotent events.

Forbidden drift:

- accounting logic;
- invoice processing;
- bank reconciliation;
- pre-accounting workflows;
- direct coupling to Comptamax24 internals.

## Mandatory rules

- Duplicate events are forbidden.
- Idempotency must be used where duplicate execution would create inconsistent state.
- Employee, planning and rights changes must be auditable.
- Runtime-sensitive flows must be validated with tests or safe runtime checks where possible.
- Do not invent business rules when a rule is truly missing.
- If a business rule is obvious from existing validated scope, implement it.
- If a business rule is genuinely not decided and materially changes the product, stop and ask.

## Stop only for real blockers

Ask for explicit human validation only if one of these applies:

- irreversible deletion or purge;
- secret rotation or secret exposure;
- dangerous production action;
- payment, 2FA, password, or missing credential;
- genuinely unresolved product or architecture decision;
- major functional change affecting the business;
- concrete risk of breaking a live environment;
- concrete risk of losing work or corrupting data.

## Required working loop

For each module or increment:

1. State the module/increment you are taking.
2. Read the relevant code before editing.
3. Implement the smallest complete safe change.
4. Audit your own implementation.
5. Run required validation:
   - typecheck;
   - lint;
   - tests;
   - build if applicable;
   - runtime verification if relevant.
6. Fix failures.
7. Commit with a clear message.
8. Briefly document what was done and what was verified.
9. Move automatically to the next validated item.

Default behavior: execute, verify, document, continue.
