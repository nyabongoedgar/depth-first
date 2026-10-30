export class StepBudgetExceeded extends Error {
  constructor(public budget: number) {
    super(`Your code ran more than ${budget.toLocaleString()} steps. Is there an infinite loop, or an O(n²) approach where something faster is needed?`);
    this.name = 'StepBudgetExceeded';
  }
}

export const DEFAULT_STEP_BUDGET = 30_000_000;

export function makeCounter(budget = DEFAULT_STEP_BUDGET) {
  const st = { steps: 0, budget };
  const tick = () => {
    if (++st.steps > st.budget) throw new StepBudgetExceeded(st.budget);
  };
  return { st, tick };
}
