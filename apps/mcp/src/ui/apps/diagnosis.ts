// ─── apps/mcp/src/ui/apps/diagnosis.ts ────────────────────────────────────
// The funnel with the leaking stage marked — the Studio twin of the web
// sheet's diagnosis block. The `Diagnosis` is the tool result; the counts are
// the tool input's own days, aggregated by the contract's `aggregate`.

import type { CampaignDay, Diagnosis } from '@mazal/contracts';

import { diagnosisViewModel, type FunnelSliceVM, type StageRowVM } from '../view-data.js';
import { el, mount, showError } from './dom.js';
import { runView } from './runtime.js';

const root = mount();

function slice(vm: FunnelSliceVM, max: number): HTMLElement {
  const width = max > 0 ? Math.max(2, (vm.value / max) * 100) : 2;
  return el('div', { class: `slice ${vm.tone}` }, [
    el('span', { class: 'label' }, [vm.label]),
    el('div', { class: 'track' }, [el('div', { class: 'bar', style: `width:${width}%` })]),
    el('span', { class: 'count' }, [vm.display]),
  ]);
}

function stageRow(vm: StageRowVM): HTMLElement {
  const value = el('span', { class: 'value' }, [vm.value]);
  if (vm.tag) value.appendChild(el('span', { class: `tag ${vm.tag}` }, [vm.tag]));
  return el('div', { class: `stage ${vm.state}` }, [el('span', {}, [vm.name]), value]);
}

function render(result: unknown, input: Record<string, unknown> | undefined): void {
  const diagnosis = result as Diagnosis;
  const days = (input?.days ?? []) as CampaignDay[];
  if (!Array.isArray(days) || days.length === 0) {
    showError(root, 'the diagnosis arrived without its daily rows');
    return;
  }

  const vm = diagnosisViewModel(days, diagnosis);
  const max = Math.max(...vm.slices.map((s) => s.value));

  root.replaceChildren(
    el('h1', {}, ['Funnel diagnosis']),
    el('p', { class: `headline${diagnosis.primary ? '' : ' ok'}` }, [
      el('strong', {}, [vm.headline]),
    ]),
    ...(vm.detail ? [el('p', { class: 'note' }, [vm.detail])] : []),
    el('div', { class: 'funnel' }, vm.slices.map((s) => slice(s, max))),
    el('div', { class: 'stages' }, vm.stages.map(stageRow)),
    ...(vm.evidence ? [el('p', { class: 'note' }, [`What changed in the store: ${vm.evidence}.`])] : []),
  );
}

runView({
  name: 'Mazal funnel diagnosis',
  toolName: 'diagnose_campaign',
  render,
  renderError: (message) => showError(root, message),
});
