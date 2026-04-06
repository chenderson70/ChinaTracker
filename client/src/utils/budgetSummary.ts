import type { BudgetResult } from '../types';

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