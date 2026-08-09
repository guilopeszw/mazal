import type { Action } from '@mazal/contracts';

export interface ActionLog {
  append(actions: readonly Action[]): Action[];
}

function cloneAction(action: Action): Action {
  return {
    ...action,
    expectedEffect: { ...action.expectedEffect },
  };
}

export class InMemoryActionLog implements ActionLog {
  readonly #entries: Action[] = [];

  append(actions: readonly Action[]): Action[] {
    const logged = actions.map(cloneAction);
    this.#entries.push(...logged);
    return logged.map(cloneAction);
  }

  snapshot(): Action[] {
    return this.#entries.map(cloneAction);
  }
}
