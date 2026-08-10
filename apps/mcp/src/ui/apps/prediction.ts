// ─── apps/mcp/src/ui/apps/prediction.ts ───────────────────────────────────
// The prediction band — break-even first, then the p10–p90 band, exactly the
// numbers the engine's `Verdict` carries and nothing else.

import type { Verdict } from '@mazal/contracts';

import { bandViewModel } from '../view-data.js';
import { el, mount, showError } from './dom.js';
import { runView } from './runtime.js';

const root = mount();

const STAMP: Record<Verdict['decision'], string> = {
  launch: 'Launch',
  launch_small: 'Launch small',
  dont_launch: "Don't launch",
};

function render(result: unknown): void {
  const verdict = result as Verdict;
  if (!verdict?.predictedRoas) {
    showError(root, 'the verdict arrived without a predicted band');
    return;
  }
  const vm = bandViewModel(verdict);

  root.replaceChildren(
    el('h1', {}, ['Pre-flight verdict']),
    el('span', { class: `stamp ${vm.decision}` }, [STAMP[vm.decision]]),
    el('p', {}, [
      'Every real spent has to come back as ',
      el('strong', {}, [vm.breakEvenLabel]),
      ' before this campaign breaks even.',
    ]),
    el('div', { class: 'band' }, [
      el('div', { class: 'track' }),
      el('div', {
        class: 'fill',
        style: `left:${vm.fill.left}%;width:${vm.fill.width}%`,
      }),
      el('div', { class: 'mid', style: `left:${vm.mid}%` }),
      el('div', { class: 'break-even', style: `left:${vm.breakEven}%` }, [
        el('span', { class: 'flag' }, [`break-even ${vm.breakEvenLabel}`]),
      ]),
    ]),
    el('div', { class: 'ends' }, [
      el('span', {}, [vm.ends[0]]),
      el('span', { class: 'mid-label' }, [vm.ends[1]]),
      el('span', {}, [vm.ends[2]]),
    ]),
    ...(vm.limitingFactor ? [el('p', { class: 'note' }, [vm.limitingFactor])] : []),
    ...(vm.killTrigger ? [el('p', { class: 'note' }, [`Kill trigger: ${vm.killTrigger}`])] : []),
  );
}

runView({
  name: 'Mazal pre-flight verdict',
  toolName: 'predict_campaign',
  render,
  renderError: (message) => showError(root, message),
});
