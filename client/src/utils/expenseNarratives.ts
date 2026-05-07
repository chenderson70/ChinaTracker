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

const DEFAULT_EXPENSE_NARRATIVES: Record<string, Pick<ExpenseNarrativeItem, 'justification' | 'impact'>> = {
  om_wrm: {
    justification: 'WRM is required to provide the equipment and supplies necessary to support exercise execution. These assets are tied to UTC requirements and must be exercised to validate readiness, deployment capability, and operational sustainment.',
    impact: 'The exercise cannot fully execute, validate UTC requirements, or demonstrate mission readiness.',
  },
  om_contracts: {
    justification: 'Contract support is required to provide services or resources that cannot be supported organically by unit personnel or existing government assets. These services enable the exercise to meet operational, logistical, and training requirements.',
    impact: 'Critical exercise functions may be delayed, reduced, or unavailable, degrading mission execution.',
  },
  om_gpc_purchases: {
    justification: 'GPC purchases are necessary to obtain required supplies, materials, or minor equipment needed to support exercise planning and execution. These purchases fill immediate logistical gaps and ensure participants have the resources needed to complete training requirements.',
    impact: 'Required supplies may be unavailable, limiting participant training and exercise execution.',
  },
  om_player_billeting: {
    justification: 'Player billeting is required to house exercise participants during the training period. Providing lodging ensures personnel are available for scheduled training events and mission execution requirements.',
    impact: 'Lodging costs increase and players may arrive late to training events and exercise scenarios.',
  },
  rpa_mil_pay: {
    justification: 'RPA pay is required to place Reserve personnel in an authorized duty status to support both the planning and execution portions of the exercise. This includes the planning team, MSEL writers, logistics cell, white cell, and DTT participation needed to develop, coordinate, safely oversee, and evaluate the exercise.',
    impact: 'Planning, MSEL development, logistics support, white cell control, DTT oversight, and AAR capture functions are all degraded.',
  },
  rpa_meals: {
    justification: 'RPA player meals are required to sustain exercise participants during the training period and allow players to remain engaged in scheduled training requirements and exercise scenarios. This also provides A1 with a training platform to plan, coordinate, and deliver services support to exercise personnel.',
    impact: 'Travel costs increase, training time is disrupted, and A1 services training opportunities are reduced.',
  },
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
    const defaultItem = DEFAULT_EXPENSE_NARRATIVES[definition.expenseKey];

    return {
      section: definition.section,
      expenseKey: definition.expenseKey,
      expenseLabel: definition.expenseLabel,
      amount: definition.getAmount(exercise, budget),
      justification: savedItem ? savedItem.justification : defaultItem?.justification ?? '',
      impact: savedItem ? savedItem.impact : defaultItem?.impact ?? '',
    };
  });
}
