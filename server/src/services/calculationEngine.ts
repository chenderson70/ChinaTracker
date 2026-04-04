// Pure calculation engine — no database calls, no side effects.
// Takes exercise data + rate tables, returns fully computed budget.

export interface RateInputs {
  cpdRates: Record<string, number>;
  perDiemRates: Record<string, { lodging: number; mie: number }>;
  mealRates: { breakfast: number; lunchMre: number; dinner: number };
  playerBilletingPerNight: number;
  playerPerDiemPerDay: number;
  defaultAirfare: number;
  defaultRentalCarDailyRate: number;
}

export interface GroupCalc {
  paxCount: number;
  dutyDays: number;
  milPay: number;
  perDiem: number;
  meals: number;
  travel: number;
  billeting: number;
  subtotal: number;
}

export interface UnitCalc {
  unitCode: string;
  totalPax: number;
  planningRpa: GroupCalc;
  planningOm: GroupCalc;
  whiteCellRpa: GroupCalc;
  whiteCellOm: GroupCalc;
  playerRpa: GroupCalc;
  playerOm: GroupCalc;
  annualTourRpa: GroupCalc;
  executionRpa: number;
  executionOm: number;
  unitTotalRpa: number;
  unitTotalOm: number;
  unitTotal: number;
}

export interface BudgetResult {
  units: Record<string, UnitCalc>;
  exerciseOmCosts: Record<string, number>;
  exerciseOmTotal: number;
  wrm: number;
  totalRpa: number;
  totalOm: number;
  grandTotal: number;
  rpaTravel: number;
  totalPax: number;
  totalPlayers: number;
  totalWhiteCell: number;
  totalAnnualTour: number;
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
  group: any,
  entry: any,
  rates: RateInputs,
  dutyDays: number
): number {
  if (group.isLongTour) return 0;
  if (entry?.rankCode) {
    const cpd = rates.cpdRates[entry.rankCode] || 0;
    return (entry.count || 0) * cpd * dutyDays;
  }
  const avgCpd = group.avgCpdOverride || 200;
  return (group.paxCount || 0) * avgCpd * dutyDays;
}

function buildPlayerLikeRpaGroup(
  pax: number,
  avgDays: number,
  costs: Pick<GroupCalc, 'milPay' | 'meals' | 'travel' | 'perDiem' | 'billeting'>,
  isSgAeCabPlayer: boolean,
): { group: GroupCalc; billetingToOm: number } {
  const group = emptyGroup(pax, avgDays);
  group.milPay = costs.milPay;
  group.meals = costs.meals;
  group.travel = costs.travel;
  group.perDiem = costs.perDiem;
  group.billeting = costs.billeting;

  const billetingToOm = isSgAeCabPlayer ? group.billeting : 0;
  const rpaBilletingCharge = isSgAeCabPlayer ? 0 : group.billeting;
  group.subtotal = group.milPay + group.meals + group.travel + group.perDiem + rpaBilletingCharge;

  return { group, billetingToOm };
}

export function calculateBudget(exercise: any, rates: RateInputs): BudgetResult {
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

    // Rental cars split proportionally so totals never exceed configured exercise travel cost.
    const unitCount = (exercise.unitBudgets || []).length || 1;
    const totalRentalCost = travel.rentalCarCount * travel.rentalCarDailyRate * travel.rentalCarDays;
    const rentalCost = totalRentalCost / unitCount;

    for (const pg of ub.personnelGroups || []) {
      const entries = pg.personnelEntries || [];
      const entryPax = entries.reduce((sum: number, entry: any) => sum + (entry.count || 0), 0);
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
      const airfarePerPerson = pg.airfarePerPerson ?? travel.airfarePerPerson;
      const hasGroupRental = (pg.rentalCarCount || 0) > 0 || (pg.rentalCarDays || 0) > 0 || pg.rentalCarDaily !== null;
      const rentalDaily = pg.rentalCarDaily ?? travel.rentalCarDailyRate;
      const groupRentalCost = (pg.rentalCarCount || 0) * rentalDaily * (pg.rentalCarDays || 0);
      const appliedRentalCost = hasGroupRental ? groupRentalCost : rentalCost;
      const usesEntryLevelRental = usesWhiteCellStyleRental && entries.length > 0;
      unitCalc.totalPax += pax;

      const calcEntries = entries.length > 0
        ? entries
          : [{
              count: pax,
              rankCode: null,
              dutyDays: pg.dutyDays,
              rentalCarCount: 0,
              location: pg.location,
              isLocal: pg.isLocal,
              travelOnly: false,
            }];

      let groupMilPay = 0;
      let groupPerDiem = 0;
      let groupMeals = 0;
      let groupTravel = 0;
      let groupBilleting = 0;
      let groupRpaTravel = 0;
      let dutyDaysAccumulator = 0;

      for (const entry of calcEntries) {
        const entryCount = entry.count || 0;
        const entryDays = entry.dutyDays || pg.dutyDays || defaultDays;
        const entryLoc = entry.location || pg.location || 'GULFPORT';
        const entryIsLocal = isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal);
        const entryTravelOnly = allowsTravelOnly && isTravelOnlyFlag(entry.travelOnly);
        const entryRentalCarCount = Math.max(0, Number(entry.rentalCarCount || 0));
        const includeEntryInRpaTravel = qualifiesForRpaTravel(pg.fundingType, entryIsLocal, entryTravelOnly);
        const pdRates = rates.perDiemRates[entryLoc] || { lodging: 0, mie: 0 };

        dutyDaysAccumulator += entryDays * entryCount;

        if (isWhiteCell && pg.fundingType === 'RPA') {
          if (!entryTravelOnly) {
            groupMilPay += calcMilPay(pg, entry, rates, entryDays);
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
            groupMilPay += calcMilPay(pg, entry, rates, entryDays);
          }
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
            if (includeEntryInRpaTravel) {
              groupRpaTravel += entryCount * airfarePerPerson;
            }
          }
        } else if (isPlanningGroup && pg.fundingType === 'OM') {
          if (usesLocationPerDiemRates && !entryIsLocal) {
            groupPerDiem += entryCount * (pdRates.lodging + pdRates.mie) * entryDays;
            groupTravel += entryCount * airfarePerPerson;
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
          groupMilPay += calcMilPay(pg, entry, rates, entryDays);
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
          groupTravel += entryIsLocal ? 0 : (entryCount * airfarePerPerson);
          const nights = Math.max(entryDays, 0);
          groupBilleting += entryIsLocal ? 0 : (entryCount * rates.playerBilletingPerNight * nights);
        }
      }

      if (usesWhiteCellStyleRental && !usesEntryLevelRental && pg.fundingType === 'RPA' && groupTravel > 0 && !calcEntries.every((entry: any) => isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal))) {
        groupTravel += appliedRentalCost;
        if (calcEntries.some((entry: any) => qualifiesForRpaTravel(pg.fundingType, isLocalFlag(entry.isLocal) || isLocalFlag(pg.isLocal), allowsTravelOnly && isTravelOnlyFlag(entry.travelOnly)))) {
          groupRpaTravel += appliedRentalCost;
        }
      }
      if (usesWhiteCellStyleRental && !usesEntryLevelRental && pg.fundingType === 'OM' && hasGroupRental) {
        groupTravel += appliedRentalCost;
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
        const { group: g, billetingToOm } = buildPlayerLikeRpaGroup(
          pax,
          avgDays,
          {
            milPay: groupMilPay,
            meals: groupMeals,
            travel: groupTravel,
            perDiem: groupPerDiem,
            billeting: groupBilleting,
          },
          isSgAeCabPlayer,
        );
        sgAeCabPlayerBilletingToOm += billetingToOm;
        if (isAnnualTour) {
          accumulateGroup(unitCalc.annualTourRpa, g);
          result.totalAnnualTour += pax;
        } else {
          unitCalc.playerRpa = g;
          result.totalPlayers += pax;
        }
        result.rpaTravel += groupRpaTravel;
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

    // Execution cost lines
    for (const cl of ub.executionCostLines || []) {
      if (cl.fundingType === 'RPA') unitCalc.executionRpa += cl.amount;
      else unitCalc.executionOm += cl.amount;
    }

    unitCalc.unitTotalRpa =
      unitCalc.planningRpa.subtotal +
      unitCalc.whiteCellRpa.subtotal +
      unitCalc.playerRpa.subtotal +
      unitCalc.annualTourRpa.subtotal +
      unitCalc.executionRpa;
    unitCalc.unitTotalOm = unitCalc.planningOm.subtotal + unitCalc.whiteCellOm.subtotal + unitCalc.playerOm.subtotal + unitCalc.executionOm;
    unitCalc.unitTotal = unitCalc.unitTotalRpa + unitCalc.unitTotalOm;

    result.units[ub.unitCode] = unitCalc;
    result.totalRpa += unitCalc.unitTotalRpa;
    result.totalOm += unitCalc.unitTotalOm;
  }

  // Exercise-level O&M
  for (const ol of exercise.omCostLines || []) {
    const cat = ol.category as string;
    result.exerciseOmCosts[cat] = (result.exerciseOmCosts[cat] || 0) + ol.amount;
    result.exerciseOmTotal += ol.amount;
    if (cat === 'WRM') result.wrm += ol.amount;
  }
  result.totalOm += result.exerciseOmTotal;
  result.grandTotal = result.totalRpa + result.totalOm;
  result.totalPax = result.totalPlayers + result.totalWhiteCell + result.totalAnnualTour;

  return result;
}
