---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

## Scope

The single route of `apps/web`. Everything is on it: onboarding is a modal, the plan is a
panel, chat is a sidebar. The demo never navigates — it time-jumps the data between two
moments of the same product's life.

Visitor mode: **Operate**. The visitor is reading a diagnosis and deciding whether to act on
it. Expression may not obscure the task, the state, or the numbers.

## Audience and job

A Brazilian seller deciding whether to launch a campaign, or finding out why a running one
died. Watched, in this build, by a hackathon judge on a projector — who wins conflicts of
scale and hierarchy, but never wins by deleting an auditable value.

## Action and content

The screen must carry, findable in seconds: the seven-stage funnel with exactly one stage
marked as the leak; the finding's observed value, reference, sample behind the reference, and
rule id; the daily series with the change point; the plan, split by who may perform each
action; and the receipt after running one.

## Constraints

Numbers come from `@mazal/contracts` and its metric functions — never computed in a
component. `buildPlan`'s projection is zeroed and stays off screen. The three plan controls
read **Run all · Edit first · I'll do it myself**, in that order and that wording; everything
else is pt-BR. Category is a select over `OLIST_CATEGORIES`.

## Chosen direction — Via do Cliente

Seed key `e285409d`, assigned index 3, chosen by the user over three challengers.

Brazilian transactional print: the nota fiscal, the boleto, the Correios tracking slip. Not a
scan of 1994 — a document a machine is printing now. Green carbonless copy stock, black
impact ink, aniline stamp red, the carbon ghost of the second via.

The world was chosen because the product's three most awkward obligations become native
affordances of the form instead of disclaimers bolted on top:

- writes are simulated → the **SEM VALOR FISCAL** stamp
- it proposes, you decide → the signature line
- every claim names its rule → the rule id sits where a chave de acesso sits
- `/api/execute` returns a receipt → a numbered **protocolo** torn off at a perforation

The funnel is the tracking block: seven numbered rows, ruled, one carrying a red stamp.

## Memorable moment

The verdict stamped diagonally across the header in bled aniline red — **NÃO LANÇAR** — over a
document that is otherwise entirely black on pale green. It is the one saturated mark on the
page and it is legible from the back of the room.

## Unresolved

Whether the pre-flight case or the in-flight case opens the demo. PRODUCT.md sets the headline
promise as "don't launch"; `docs/plan/README.md` says to finish the in-flight case first if
only one survives. Build order and narrative order may differ.
