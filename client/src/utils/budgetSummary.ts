import type { BudgetResult, UnitCalc } from '../types';

export type RpaCategoryTotals = {
  milPay: number;
  travelAndPerDiem: number;
  meals: number;
};

export type PlayerOmResponsibilityTotals = {
  total: number;
  billeting: number;
  nonBilleting: number;
};

export type RpaMealsResponsibilityTotals = {
  total: number;
  playerMeals: number;
  annualTourMeals: number;
};

export const OVERALL_EXERCISE_TOTAL_LABEL = 'Overall Exercise Total (AT + RPA + O&M)';
export const A7_RPA_OM_TOTAL_LABEL = 'A7 Exercise RPA & O&M TOTAL';
export const ANNUAL_TOUR_MEALS_LABEL = 'AT Meals';
export const ANNUAL_TOUR_BILLETING_LABEL = 'AT Billeting';
export const ANNUAL_TOUR_TRAVEL_PAY_LABEL = 'AT Travel Pay';
export const ANNUAL_TOUR_MIL_PAY_LABEL = 'AT Mil Pay';

export function getAnnualTourRpaTotal(budget: BudgetResult): number {
  return Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.subtotal || 0), 0);
}

export function getUnitRpaCategoryTotals(unit: UnitCalc): RpaCategoryTotals {
  return {
    milPay:
      (unit.planningRpa?.milPay || 0) +
      (unit.whiteCellRpa?.milPay || 0) +
      (unit.playerRpa?.milPay || 0),
    travelAndPerDiem:
      (unit.planningRpa?.travel || 0) +
      (unit.planningRpa?.perDiem || 0) +
      (unit.whiteCellRpa?.travel || 0) +
      (unit.whiteCellRpa?.perDiem || 0) +
      (unit.playerRpa?.travel || 0) +
      (unit.playerRpa?.perDiem || 0) +
      (unit.executionRpa || 0),
    meals:
      (unit.playerRpa?.meals || 0) +
      (unit.annualTourRpa?.meals || 0),
  };
}

export function getRpaCategoryTotals(budget: BudgetResult): RpaCategoryTotals {
  return Object.values(budget.units).reduce<RpaCategoryTotals>(
    (totals, unit) => {
      const unitTotals = getUnitRpaCategoryTotals(unit);
      return {
        milPay: totals.milPay + unitTotals.milPay,
        travelAndPerDiem: totals.travelAndPerDiem + unitTotals.travelAndPerDiem,
        meals: totals.meals + unitTotals.meals,
      };
    },
    { milPay: 0, travelAndPerDiem: 0, meals: 0 },
  );
}

export function getPlayerOmResponsibilityByUnit(budget: BudgetResult): Record<string, PlayerOmResponsibilityTotals> {
  const totalsByUnit = Object.values(budget.units).reduce<Record<string, PlayerOmResponsibilityTotals>>((acc, unit) => {
    const normalizedUnitCode = String(unit.unitCode || '').toUpperCase();
    const subtotal = Number(unit.playerOm?.subtotal || 0);
    const billeting = Number(unit.playerOm?.billeting || 0);
    const nonBilleting = Math.max(0, subtotal - billeting);

    acc[normalizedUnitCode] = {
      total: subtotal,
      billeting,
      nonBilleting,
    };

    return acc;
  }, {});

  const redistributedBilleting = ['SG', 'AE', 'CAB'].reduce(
    (sum, unitCode) => sum + (totalsByUnit[unitCode]?.billeting || 0),
    0,
  );

  ['SG', 'AE', 'CAB'].forEach((unitCode) => {
    if (!totalsByUnit[unitCode]) return;
    totalsByUnit[unitCode] = {
      total: totalsByUnit[unitCode].nonBilleting,
      billeting: 0,
      nonBilleting: totalsByUnit[unitCode].nonBilleting,
    };
  });

  const a7Existing = totalsByUnit.A7 || { total: 0, billeting: 0, nonBilleting: 0 };
  totalsByUnit.A7 = {
    total: a7Existing.total + redistributedBilleting,
    billeting: a7Existing.billeting + redistributedBilleting,
    nonBilleting: a7Existing.nonBilleting,
  };

  return totalsByUnit;
}

export function getRpaMealsResponsibilityByUnit(budget: BudgetResult): Record<string, RpaMealsResponsibilityTotals> {
  const totalsByUnit = Object.values(budget.units).reduce<Record<string, RpaMealsResponsibilityTotals>>((acc, unit) => {
    const normalizedUnitCode = String(unit.unitCode || '').toUpperCase();
    acc[normalizedUnitCode] = {
      total: 0,
      playerMeals: 0,
      annualTourMeals: 0,
    };
    return acc;
  }, {});

  const playerMeals = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa?.meals || 0), 0);
  const annualTourMeals = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.meals || 0), 0);

  totalsByUnit.A7 = {
    total: playerMeals + annualTourMeals,
    playerMeals,
    annualTourMeals,
  };

  return totalsByUnit;
}

export function getAnnualTourMilPayTotal(budget: BudgetResult): number {
  return Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.milPay || 0), 0);
}

export function getAnnualTourTravelPayTotal(budget: BudgetResult): number {
  return Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.travel || 0) + (unit.annualTourRpa?.perDiem || 0), 0);
}

export function getAnnualTourRpaMealsTotal(budget: BudgetResult): number {
  return Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.meals || 0), 0);
}

export function getAnnualTourBilletingOmTotal(budget: BudgetResult): number {
  return Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.billeting || 0), 0);
}

export function getAnnualTourFundedTotal(budget: BudgetResult): number {
  return getAnnualTourRpaMealsTotal(budget) + getAnnualTourBilletingOmTotal(budget);
}

export function getAnnualTourBoxTotal(budget: BudgetResult): number {
  return getAnnualTourMilPayTotal(budget) + getAnnualTourTravelPayTotal(budget);
}

export function getA7RpaOmTotal(budget: BudgetResult): number {
  return Math.max(0, budget.totalRpa + budget.totalOm);
}