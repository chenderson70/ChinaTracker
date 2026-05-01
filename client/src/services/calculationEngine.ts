// Pure calculation engine — no side effects.
// Ported from server/src/services/calculationEngine.ts to run entirely in-browser.

import type { BudgetResult, GroupCalc, UnitCalc, ExerciseDetail } from '../types';

export interface RateInputs {
  cpdRates: Record<string, number>;
  perDiemRates: Record<string, { lodging: number; mie: number }>;
  mealRates: { breakfast: number; lunchMre: number; dinner: number };
  playerBilletingPerNight: number;
  playerPerDiemPerDay: number;
  defaultAirfare: number;
  defaultRentalCarDailyRate: number;
}

function normalizeDateValue(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function calculateInclusiveDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
}

function getPlayerExecutionExerciseDutyDays(exercise: Pick<ExerciseDetail, 'startDate' | 'endDate' | 'defaultDutyDays'>): number | null {
  const normalizedStartDate = normalizeDateValue(exercise.startDate);
  const normalizedEndDate = normalizeDateValue(exercise.endDate);
  return calculateInclusiveDays(normalizedStartDate, normalizedEndDate)
    ?? (exercise.defaultDutyDays ? Math.max(1, Number(exercise.defaultDutyDays || 1)) : null);
}

function resolveEntryDutyDays(params: {
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate' | 'defaultDutyDays'>;
  group: { role?: string; dutyDays?: number | null };
  entry: { startDate?: string | null; endDate?: string | null; dutyDays?: number | null };
  defaultDays: number;
}): number {
  const { exercise, group, entry, defaultDays } = params;
  const normalizedStartDate = normalizeDateValue(entry.startDate);
  const normalizedEndDate = normalizeDateValue(entry.endDate);

  if (group.role === 'PLAYER' && !normalizedStartDate && !normalizedEndDate) {
    return getPlayerExecutionExerciseDutyDays(exercise) ?? defaultDays;
  }

  return Number(entry.dutyDays || group.dutyDays || defaultDays || 1);
}

function emptyGroup(pax = 0, days = 0): GroupCalc {
  return { paxCount: pax, dutyDays: days, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
}

function accumulateGroup(target: GroupCalc, source: GroupCalc): GroupCalc {
  const existingPax = target.paxCount || 0;
  const incomingPax = source.paxCount || 0;
  const totalPax = existingPax + incomingPax;

  target.dutyDays = totalPax > 0
    ? (((target.dutyDays || 0) * existingPax) + ((source.dutyDays || 0) * incomingPax)) / totalPax
    : 0;
  target.paxCount = totalPax;
  target.milPay += source.milPay || 0;
  target.perDiem += source.perDiem || 0;
  target.meals += source.meals || 0;
  target.travel += source.travel || 0;
  target.billeting += source.billeting || 0;
  target.subtotal += source.subtotal || 0;

  return target;
}

function isLocalFlag(value: any): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'local';
  }
  return false;
}

function isTravelOnlyFlag(value: any): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'travel only' || normalized === 'travel_only';
  }
  return false;
}

function qualifiesForRpaTravel(fundingType: any, entryIsLocal: boolean, entryTravelOnly: boolean): boolean {
  return fundingType === 'RPA' && (entryTravelOnly || !entryIsLocal);
}

function calcMilPay(
  group: { isLongTour: boolean; avgCpdOverride: number | null; paxCount: number },
  entry: { rankCode: string | null; count: number },
  rates: RateInputs,
  dutyDays: number,
): number {
  if (group.isLongTour) return 0;
  if (entry?.rankCode) {
    const cpd = rates.cpdRates[entry.rankCode] || 0;
    return (entry.count || 0) * cpd * dutyDays;
  }
  const avgCpd = group.avgCpdOverride || 200;
  return group.paxCount * avgCpd * dutyDays;
}

function buildPlayerLikeRpaGroup(
  pax: number,
  avgDays: number,
  costs: Pick<GroupCalc, 'milPay' | 'meals' | 'travel' | 'perDiem' | 'billeting'>,
  billetingIsOm: boolean,
): { group: GroupCalc; billetingToOm: number } {
  const group = emptyGroup(pax, avgDays);
  group.milPay = costs.milPay;
  group.meals = costs.meals;
  group.travel = costs.travel;
  group.perDiem = costs.perDiem;
  group.billeting = costs.billeting;

  const billetingToOm = billetingIsOm ? group.billeting : 0;
  const rpaBilletingCharge = billetingIsOm ? 0 : group.billeting;
  group.subtotal = group.milPay + group.meals + group.travel + group.perDiem + rpaBilletingCharge;

  return { group, billetingToOm };
}

export function calculateBudget(exercise: ExerciseDetail, rates: RateInputs): BudgetResult {
  const defaultDays = exercise.defaultDutyDays || 1;
  const travel = exercise.travelConfig || {
    airfarePerPerson: rates.defaultAirfare,
    rentalCarDailyRate: rates.defaultRentalCarDailyRate,
    rentalCarCount: 0,
    rentalCarDays: 0,
  };

  const result: BudgetResult = {
    units: {},
    exerciseOmCosts: {},
    exerciseOmTotal: 0,
    wrm: 0,
    totalRpa: 0,
    totalOm: 0,
    grandTotal: 0,
    rpaTravel: 0,
    totalPax: 0,
    totalPlayers: 0,
    totalWhiteCell: 0,
    totalAnnualTour: 0,
  };

  const mealsPerDay = rates.mealRates.breakfast + rates.mealRates.lunchMre + rates.mealRates.dinner;
  const playerRpaMealsPerDay = mealsPerDay;

  for (const ub of exercise.unitBudgets || []) {
    const unitCalc: UnitCalc = {
      unitCode: ub.unitCode,
      unitDisplayName: ub.unitDisplayName || null,
      totalPax: 0,
      planningRpa: emptyGroup(),
      planningOm: emptyGroup(),
      whiteCellRpa: emptyGroup(),
      whiteCellOm: emptyGroup(),
      playerRpa: emptyGroup(),
      playerOm: emptyGroup(),
      annualTourRpa: emptyGroup(),
      executionRpa: 0,
      executionOm: 0,
      unitTotalRpa: 0,
      unitTotalOm: 0,
      unitTotal: 0,
    };
    let sgAeCabPlayerBilletingToOm = 0;

    const unitCount = (exercise.unitBudgets || []).length || 1;
    const totalRentalCost = travel.rentalCarCount * travel.rentalCarDailyRate * travel.rentalCarDays;
    const rentalCost = totalRentalCost / unitCount;

    for (const pg of ub.personnelGroups || []) {
      const entries = pg.personnelEntries || [];
      const entryPax = entries.reduce((sum, e) => sum + (e.count || 0), 0);
      const pax = pg.paxCount || entryPax || 0;
      const unitCode = String(ub.unitCode || '').toUpperCase();
      const isSgAeCab = unitCode === 'SG' || unitCode === 'AE' || unitCode === 'CAB';
      const isPlanning = pg.role === 'PLANNING';
      const isSupport = pg.role === 'SUPPORT';
      const isWhiteCell = pg.role === 'WHITE_CELL' || isSupport;
      const usesWhiteCellStyleRental = pg.role === 'WHITE_CELL' || isSupport;
      const isPlayer = pg.role === 'PLAYER';
      const isAnnualTour = pg.role === 'ANNUAL_TOUR';
      const isPlayerLike = isPlayer || isAnnualTour;
      const isPlanningGroup = isPlanning;
      const allowsTravelOnly = isPlanningGroup || isSupport;
      const isSgAeCabPlayer = isSgAeCab && isPlayerLike;
      const usesLocationPerDiemRates = isPlanningGroup || isWhiteCell;
      const usesPlayerPerDiemRates = isPlayerLike;
      const airfarePerPerson = travel.airfarePerPerson;
      const rentalDaily = travel.rentalCarDailyRate;
      const hasLegacyGroupRental = (pg.rentalCarCount || 0) > 0 || (pg.rentalCarDays || 0) > 0;
      const groupRentalCost = (pg.rentalCarCount || 0) * rentalDaily * (pg.rentalCarDays || 0);
      const appliedLegacyRentalCost = hasLegacyGroupRental ? groupRentalCost : rentalCost;
      const usesEntryLevelRental = (isPlanningGroup || usesWhiteCellStyleRental) && entries.length > 0;
      unitCalc.totalPax += pax;

      const calcEntries = entries.length > 0
        ? entries
        : [{ count: pax, rankCode: null, dutyDays: pg.dutyDays, rentalCarCount: 0, location: pg.location, isLocal: pg.isLocal, travelOnly: false }];

      let groupMilPay = 0;
      let groupPerDiem = 0;
      let groupMeals = 0;
      let groupTravel = 0;
      let groupBilleting = 0;
      let groupRpaTravel = 0;
      let dutyDaysAccumulator = 0;

      for (const entry of calcEntries) {
        const entryCount = entry.count || 0;
        const entryDays = resolveEntryDutyDays({
          exercise,
          group: pg,
          entry,
          defaultDays,
        });
        const entryLoc = entry.location || pg.location || 'FORT_HUNTER_LIGGETT';
        const entryIsLocal = isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal);
        const entryTravelOnly = allowsTravelOnly && isTravelOnlyFlag(entry.travelOnly);
        const entryRentalCarCount = Math.max(0, Number((entry as any).rentalCarCount || 0));
        const includeEntryInRpaTravel = qualifiesForRpaTravel(pg.fundingType, entryIsLocal, entryTravelOnly);
        const pdRates = rates.perDiemRates[entryLoc] || { lodging: 0, mie: 0 };

        dutyDaysAccumulator += entryDays * entryCount;

        if (isWhiteCell && pg.fundingType === 'RPA') {
          if (!entryTravelOnly) {
            groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          }
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryCount * airfarePerPerson;
            }
          }
          if (usesEntryLevelRental && entryRentalCarCount > 0) {
            groupTravel += entryRentalCarCount * rentalDaily * entryDays;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryRentalCarCount * rentalDaily * entryDays;
            }
          }
        } else if (isPlanningGroup && pg.fundingType === 'RPA') {
          if (!entryTravelOnly) {
            groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          }
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryCount * airfarePerPerson;
            }
          }
          if (usesEntryLevelRental && entryRentalCarCount > 0) {
            groupTravel += entryRentalCarCount * rentalDaily * entryDays;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryRentalCarCount * rentalDaily * entryDays;
            }
          }
        } else if (isPlanningGroup && pg.fundingType === 'OM') {
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
          }
          if (usesEntryLevelRental && entryRentalCarCount > 0) {
            groupTravel += entryRentalCarCount * rentalDaily * entryDays;
          }
        } else if (isWhiteCell && pg.fundingType === 'OM') {
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
          }
          if (usesEntryLevelRental && entryRentalCarCount > 0) {
            groupTravel += entryRentalCarCount * rentalDaily * entryDays;
          }
        } else if (isPlayerLike && pg.fundingType === 'RPA') {
          groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          groupMeals += entryCount * playerRpaMealsPerDay * entryDays;
          if (usesPlayerPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * rates.playerPerDiemPerDay * entryDays;
            groupTravel += entryCount * airfarePerPerson;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryCount * airfarePerPerson;
            }
            const nights = Math.max(entryDays, 0);
            groupBilleting += entryCount * rates.playerBilletingPerNight * nights;
          }
        } else if (isPlayer && pg.fundingType === 'OM') {
          if (usesPlayerPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * rates.playerPerDiemPerDay * entryDays;
          }
          groupTravel += entryIsLocal ? 0 : (entryCount * travel.airfarePerPerson);
          const nights = Math.max(entryDays, 0);
          groupBilleting += entryIsLocal ? 0 : (entryCount * rates.playerBilletingPerNight * nights);
        }
      }

      if (usesWhiteCellStyleRental && !usesEntryLevelRental && pg.fundingType === 'RPA' && hasLegacyGroupRental && groupTravel > 0 && !calcEntries.every((entry) => isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal))) {
        groupTravel += appliedLegacyRentalCost;
        if (calcEntries.some((entry) => qualifiesForRpaTravel(pg.fundingType, isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal), allowsTravelOnly && isTravelOnlyFlag(entry.travelOnly)))) {
          groupRpaTravel += appliedLegacyRentalCost;
        }
      }
      if (usesWhiteCellStyleRental && !usesEntryLevelRental && pg.fundingType === 'OM' && hasLegacyGroupRental) {
        groupTravel += appliedLegacyRentalCost;
      }

      const avgDays = pax > 0 ? dutyDaysAccumulator / pax : (pg.dutyDays || defaultDays);

      if (isWhiteCell && pg.fundingType === 'RPA') {
        const g = emptyGroup(pax, avgDays);
        g.milPay = groupMilPay;
        g.perDiem = groupPerDiem;
        g.travel = groupTravel;
        g.subtotal = g.milPay + g.perDiem + g.travel;
        unitCalc.whiteCellRpa = g;
        result.totalWhiteCell += pax;
        result.rpaTravel += groupRpaTravel;
      } else if (isWhiteCell && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, avgDays);
        g.perDiem = groupPerDiem;
        g.travel = groupTravel;
        g.subtotal = g.perDiem + g.travel;
        unitCalc.whiteCellOm = g;
        result.totalWhiteCell += pax;
      } else if (isPlanningGroup && pg.fundingType === 'RPA') {
        const g = emptyGroup(pax, avgDays);
        g.milPay = groupMilPay;
        g.meals = 0;
        g.travel = groupTravel;
        g.perDiem = groupPerDiem;
        g.billeting = groupBilleting;
        g.subtotal = g.milPay + g.travel + g.perDiem + g.billeting;
        unitCalc.planningRpa = g;
        result.totalPlayers += pax;
        result.rpaTravel += groupRpaTravel;
      } else if (isPlanningGroup && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, avgDays);
        g.travel = groupTravel;
        g.perDiem = groupPerDiem;
        g.billeting = 0;
        g.subtotal = g.travel + g.perDiem;
        unitCalc.planningOm = g;
        result.totalPlayers += pax;
      } else if (isPlayerLike && pg.fundingType === 'RPA') {
        const costs = {
          milPay: groupMilPay,
          meals: groupMeals,
          travel: groupTravel,
          perDiem: groupPerDiem,
          billeting: groupBilleting,
        };
        const { group: g, billetingToOm } = buildPlayerLikeRpaGroup(
          pax,
          avgDays,
          costs,
          true,
        );
        sgAeCabPlayerBilletingToOm += billetingToOm;
        if (isAnnualTour) {
          accumulateGroup(unitCalc.annualTourRpa, g);
          result.totalAnnualTour += pax;
        } else {
          unitCalc.playerRpa = g;
          result.totalPlayers += pax;
          result.rpaTravel += groupRpaTravel;
        }
      } else if (isPlayer && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, avgDays);
        g.travel = groupTravel;
        g.perDiem = groupPerDiem;
        g.billeting = groupBilleting;
        g.subtotal = g.travel + g.perDiem + g.billeting;
        unitCalc.playerOm = g;
        result.totalPlayers += pax;
      }
    }

    if (sgAeCabPlayerBilletingToOm > 0) {
      unitCalc.playerOm.billeting += sgAeCabPlayerBilletingToOm;
      unitCalc.playerOm.subtotal += sgAeCabPlayerBilletingToOm;
    }

    for (const cl of ub.executionCostLines || []) {
      if (cl.fundingType === 'RPA') unitCalc.executionRpa += cl.amount;
      else unitCalc.executionOm += cl.amount;
    }

    const annualTourMeals = unitCalc.annualTourRpa.meals || 0;
    const annualTourOperationalTotal =
      (unitCalc.annualTourRpa.milPay || 0) +
      (unitCalc.annualTourRpa.travel || 0) +
      (unitCalc.annualTourRpa.perDiem || 0);

    unitCalc.unitTotalRpa =
      unitCalc.planningRpa.subtotal +
      unitCalc.whiteCellRpa.subtotal +
      unitCalc.playerRpa.subtotal +
      unitCalc.executionRpa +
      annualTourMeals;
    unitCalc.unitTotalOm = unitCalc.planningOm.subtotal + unitCalc.whiteCellOm.subtotal + unitCalc.playerOm.subtotal + unitCalc.executionOm;
    unitCalc.unitTotal = unitCalc.unitTotalRpa + annualTourOperationalTotal + unitCalc.unitTotalOm;

    result.units[ub.unitCode] = unitCalc;
    result.totalRpa += unitCalc.unitTotalRpa;
    result.totalOm += unitCalc.unitTotalOm;
  }

  for (const ol of exercise.omCostLines || []) {
    const cat = ol.category as string;
    result.exerciseOmCosts[cat] = (result.exerciseOmCosts[cat] || 0) + ol.amount;
    result.exerciseOmTotal += ol.amount;
    if (cat === 'WRM') result.wrm += ol.amount;
  }
  const annualTourTotal = Object.values(result.units)
    .reduce(
      (sum, unit) =>
        sum +
        (unit.annualTourRpa?.milPay || 0) +
        (unit.annualTourRpa?.travel || 0) +
        (unit.annualTourRpa?.perDiem || 0),
      0,
    );
  result.totalOm += result.exerciseOmTotal;
  result.grandTotal = result.totalRpa + result.totalOm + annualTourTotal;
  result.totalPax = result.totalPlayers + result.totalWhiteCell + result.totalAnnualTour;

  return result;
}
