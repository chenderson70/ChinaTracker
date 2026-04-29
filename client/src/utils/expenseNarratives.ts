import type { BudgetResult, ExerciseDetail, ExpenseNarrativeItem, ExecutionCostLine, OmCostLine } from '../types';

export type DerivedExpenseNarrativeRow = ExpenseNarrativeItem & {
  amount: number;
  section: 'OM' | 'RPA';
};

type ExpenseNarrativeDefinition = {
  section: 'OM' | 'RPA';
  expenseKey: string;
  expenseLabel: string;
  getAmount: (exercise: ExerciseDetail, budget: BudgetResult) => number;
};

function getUnitExecutionOmLines(exercise: ExerciseDetail): ExecutionCostLine[] {
  return (exercise.unitBudgets || [])
    .flatMap((unitBudget) => unitBudget.executionCostLines || [])
    .filter((line) => String(line.fundingType || '').toUpperCase() === 'OM');
}

function getExerciseOmCostsByCategory(exercise: ExerciseDetail, category: string): number {
  return (exercise.omCostLines || [])
    .filter((line: OmCostLine) => String(line.category || '').toUpperCase() === category)
    .reduce((sum, line) => sum + (line.amount || 0), 0);
}

const EXPENSE_NARRATIVE_DEFINITIONS: ExpenseNarrativeDefinition[] = [
  {
    section: 'OM',
    expenseKey: 'om_wrm',
    expenseLabel: 'WRM',
    getAmount: (exercise) => {
      const unitWrmTotal = getUnitExecutionOmLines(exercise)
        .filter((line) => {
          const category = String(line.category || '').toUpperCase();
          return category === 'WRM' || category === 'UFR';
        })
        .reduce((sum, line) => sum + (line.amount || 0), 0);

      return unitWrmTotal + getExerciseOmCostsByCategory(exercise, 'WRM');
    },
  },
  {
    section: 'OM',
    expenseKey: 'om_contracts',
    expenseLabel: 'Contracts',
    getAmount: (exercise) => {
      const unitContractsTotal = getUnitExecutionOmLines(exercise)
        .filter((line) => String(line.category || '').toUpperCase() === 'TITLE_CONTRACTS')
        .reduce((sum, line) => sum + (line.amount || 0), 0);

      return unitContractsTotal + getExerciseOmCostsByCategory(exercise, 'CONTRACT');
    },
  },
  {
    section: 'OM',
    expenseKey: 'om_gpc_purchases',
    expenseLabel: 'GPC Purchases',
    getAmount: (exercise) => getUnitExecutionOmLines(exercise)
      .filter((line) => String(line.category || '').toUpperCase() === 'GPC_PURCHASES')
      .reduce((sum, line) => sum + (line.amount || 0), 0),
  },
  {
    section: 'OM',
    expenseKey: 'om_player_billeting',
    expenseLabel: 'Player Billeting',
    getAmount: (_exercise, budget) => Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.playerOm.billeting || 0), 0),
  },
  {
    section: 'RPA',
    expenseKey: 'rpa_mil_pay',
    expenseLabel: 'RPA (pay)',
    getAmount: (_exercise, budget) => Object.values(budget.units)
      .reduce(
        (sum, unit) =>
          sum +
          (unit.planningRpa.milPay || 0) +
          (unit.whiteCellRpa.milPay || 0) +
          (unit.playerRpa.milPay || 0),
        0,
      ),
  },
  {
    section: 'RPA',
    expenseKey: 'rpa_meals',
    expenseLabel: 'RPA (player meals)',
    getAmount: (_exercise, budget) => Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.playerRpa.meals || 0), 0),
  },
];

export function normalizeExpenseNarratives(
  items: ExpenseNarrativeItem[] | undefined | null,
): ExpenseNarrativeItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      expenseKey: String(item?.expenseKey || '').trim(),
      expenseLabel: String(item?.expenseLabel || item?.expenseKey || '').trim(),
      justification: String(item?.justification ?? ''),
      impact: String(item?.impact ?? ''),
    }))
    .filter((item) => item.expenseKey.length > 0);
}

export function getSavableExpenseNarratives(
  rows: Array<Pick<DerivedExpenseNarrativeRow, 'expenseKey' | 'expenseLabel' | 'justification' | 'impact'>>,
): ExpenseNarrativeItem[] {
  return rows.map((row) => ({
    expenseKey: String(row.expenseKey || '').trim(),
    expenseLabel: String(row.expenseLabel || '').trim(),
    justification: String(row.justification ?? ''),
    impact: String(row.impact ?? ''),
  })).filter((row) => row.expenseKey.length > 0);
}

export function buildExpenseNarrativeRows(
  exercise: ExerciseDetail,
  budget: BudgetResult,
  savedItems: ExpenseNarrativeItem[] | undefined | null,
): DerivedExpenseNarrativeRow[] {
  const savedByKey = new Map(
    normalizeExpenseNarratives(savedItems).map((item) => [item.expenseKey, item]),
  );

  return EXPENSE_NARRATIVE_DEFINITIONS.map((definition) => {
    const savedItem = savedByKey.get(definition.expenseKey);

    return {
      section: definition.section,
      expenseKey: definition.expenseKey,
      expenseLabel: definition.expenseLabel,
      amount: definition.getAmount(exercise, budget),
      justification: savedItem?.justification ?? '',
      impact: savedItem?.impact ?? '',
    };
  });
}
