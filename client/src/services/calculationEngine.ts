// Pure calculation engine — no side effects.
// Ported from server/src/services/calculationEngine.ts to run entirely in-browser.

import type { BudgetResult, GroupCalc, UnitCalc, ExerciseDetail } from '../types';

export interface RateInputs {
  cpdRates: Record<string, number>;
  perDiemRates: Record<string, { lodging: number; mie: number }>;
  mealRates: { breakfast: number; lunchMre: number; dinner: number };
  playerBilletingPerNight: number;
  playerPerDiemPerDay: number;
}

function emptyGroup(pax = 0, days = 0): GroupCalc {
  return { paxCount: pax, dutyDays: days, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
}

function isLocalFlag(value: any): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'local';
  }
  return false;
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

export function calculateBudget(exercise: ExerciseDetail, rates: RateInputs): BudgetResult {
  const defaultDays = exercise.defaultDutyDays || 1;
  const travel = exercise.travelConfig || {
    airfarePerPerson: 400,
    rentalCarDailyRate: 50,
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
  };

  const mealsPerDay = rates.mealRates.breakfast + rates.mealRates.lunchMre + rates.mealRates.dinner;
  const playerRpaMealsPerDay = rates.mealRates.breakfast + rates.mealRates.dinner;

  for (const ub of exercise.unitBudgets || []) {
    const unitCalc: UnitCalc = {
      unitCode: ub.unitCode,
      totalPax: 0,
      planningRpa: emptyGroup(),
      planningOm: emptyGroup(),
      whiteCellRpa: emptyGroup(),
      whiteCellOm: emptyGroup(),
      playerRpa: emptyGroup(),
      playerOm: emptyGroup(),
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
      const isPlayer = pg.role === 'PLAYER';
      const isPlanningGroup = isPlanning;
      const isSgAeCabPlayer = isSgAeCab && pg.role === 'PLAYER';
      unitCalc.totalPax += pax;

      const calcEntries = entries.length > 0
        ? entries
        : [{ count: pax, rankCode: null, dutyDays: pg.dutyDays, location: pg.location, isLocal: pg.isLocal }];

      let groupMilPay = 0;
      let groupPerDiem = 0;
      let groupMeals = 0;
      let groupTravel = 0;
      let groupBilleting = 0;
      let dutyDaysAccumulator = 0;

      for (const entry of calcEntries) {
        const entryCount = entry.count || 0;
        const entryDays = entry.dutyDays || pg.dutyDays || defaultDays;
        const entryLoc = entry.location || pg.location || 'GULFPORT';
        const entryIsLocal = isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal);
        const pdRates = rates.perDiemRates[entryLoc] || { lodging: 0, mie: 0 };

        dutyDaysAccumulator += entryDays * entryCount;

        if (isWhiteCell && pg.fundingType === 'RPA') {
          groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          if (!entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * travel.airfarePerPerson;
          }
        } else if (isPlanningGroup && pg.fundingType === 'RPA') {
          groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          if (!entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * travel.airfarePerPerson;
          }
        } else if (isPlanningGroup && pg.fundingType === 'OM') {
          if (!entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * travel.airfarePerPerson;
          }
        } else if (isPlayer && pg.fundingType === 'RPA') {
          groupMilPay += calcMilPay(pg, { rankCode: entry.rankCode || null, count: entryCount }, rates, entryDays);
          if (!entryIsLocal) {
            groupPerDiem += entryCount * rates.playerPerDiemPerDay * entryDays;
          }
          if (isSgAeCabPlayer) {
            if (!entryIsLocal) {
              groupTravel += entryCount * travel.airfarePerPerson;
              const nights = Math.max(entryDays, 0);
              groupBilleting += entryCount * rates.playerBilletingPerNight * nights;
            }
            groupMeals += entryCount * playerRpaMealsPerDay * entryDays;
          } else {
            groupMeals += entryCount * mealsPerDay * entryDays;
            const nights = Math.max(entryDays, 0);
            groupBilleting += entryIsLocal ? 0 : (entryCount * rates.playerBilletingPerNight * nights);
          }
        } else if (isPlayer && pg.fundingType === 'OM') {
          if (!entryIsLocal) {
            groupPerDiem += entryCount * rates.playerPerDiemPerDay * entryDays;
          }
          groupTravel += entryIsLocal ? 0 : (entryCount * travel.airfarePerPerson);
          const nights = Math.max(entryDays, 0);
          groupBilleting += entryIsLocal ? 0 : (entryCount * rates.playerBilletingPerNight * nights);
        }
      }

      if (isWhiteCell && pg.fundingType === 'RPA' && groupTravel > 0 && !calcEntries.every((entry) => isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal))) {
        groupTravel += rentalCost;
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
        if (pg.isLongTour) result.rpaTravel += g.travel;
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
      } else if (isPlanningGroup && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, avgDays);
        g.travel = groupTravel;
        g.perDiem = groupPerDiem;
        g.billeting = 0;
        g.subtotal = g.travel + g.perDiem;
        unitCalc.planningOm = g;
        result.totalPlayers += pax;
      } else if (isPlayer && pg.fundingType === 'RPA') {
        const g = emptyGroup(pax, avgDays);
        const billetingToOm = isSgAeCabPlayer ? groupBilleting : 0;
        g.milPay = groupMilPay;
        g.meals = groupMeals;
        g.travel = groupTravel;
        g.perDiem = groupPerDiem;
        g.billeting = groupBilleting;
        const rpaBilletingCharge = isSgAeCabPlayer ? 0 : g.billeting;
        g.subtotal = g.milPay + g.meals + g.travel + g.perDiem + rpaBilletingCharge;
        sgAeCabPlayerBilletingToOm += billetingToOm;
        unitCalc.playerRpa = g;
        result.totalPlayers += pax;
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

    unitCalc.unitTotalRpa = unitCalc.planningRpa.subtotal + unitCalc.whiteCellRpa.subtotal + unitCalc.playerRpa.subtotal + unitCalc.executionRpa;
    unitCalc.unitTotalOm = unitCalc.planningOm.subtotal + unitCalc.whiteCellOm.subtotal + unitCalc.playerOm.subtotal + unitCalc.executionOm;
    unitCalc.unitTotal = unitCalc.unitTotalRpa + unitCalc.unitTotalOm;

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
  result.totalOm += result.exerciseOmTotal;
  result.grandTotal = result.totalRpa + result.totalOm;
  result.totalPax = result.totalPlayers + result.totalWhiteCell;

  return result;
}
