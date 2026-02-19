// Pure calculation engine — no database calls, no side effects.
// Takes exercise data + rate tables, returns fully computed budget.

export interface RateInputs {
  cpdRates: Record<string, number>;
  perDiemRates: Record<string, { lodging: number; mie: number }>;
  mealRates: { breakfast: number; lunchMre: number; dinner: number };
  playerBilletingPerNight: number;
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
  whiteCellRpa: GroupCalc;
  whiteCellOm: GroupCalc;
  playerRpa: GroupCalc;
  playerOm: GroupCalc;
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
}

function emptyGroup(pax = 0, days = 0): GroupCalc {
  return { paxCount: pax, dutyDays: days, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
}

function calcMilPay(
  group: any,
  entries: any[],
  rates: RateInputs,
  dutyDays: number
): number {
  if (group.isLongTour) return 0;
  if (entries && entries.length > 0) {
    return entries.reduce((sum: number, e: any) => {
      const cpd = rates.cpdRates[e.rankCode] || 0;
      return sum + e.count * cpd * dutyDays;
    }, 0);
  }
  const avgCpd = group.avgCpdOverride || 200;
  return group.paxCount * avgCpd * dutyDays;
}

export function calculateBudget(exercise: any, rates: RateInputs): BudgetResult {
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

  for (const ub of exercise.unitBudgets || []) {
    const unitCalc: UnitCalc = {
      unitCode: ub.unitCode,
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

    // Rental cars split evenly across units (simple approach)
    const unitCount = (exercise.unitBudgets || []).length || 1;
    const rentalCarsPerUnit = Math.ceil(travel.rentalCarCount / unitCount);
    const rentalCost = rentalCarsPerUnit * travel.rentalCarDailyRate * travel.rentalCarDays;

    for (const pg of ub.personnelGroups || []) {
      const days = pg.dutyDays || defaultDays;
      const pax = pg.paxCount || 0;
      const entries = pg.personnelEntries || [];
      const isWhiteCell = pg.role === 'WHITE_CELL' || pg.role === 'PLANNING' || pg.role === 'SUPPORT';
      const isPlayer = pg.role === 'PLAYER';
      const loc = pg.location || 'GULFPORT';
      const pdRates = rates.perDiemRates[loc] || { lodging: 0, mie: 0 };

      if (isWhiteCell && pg.fundingType === 'RPA') {
        const g = emptyGroup(pax, days);
        g.milPay = calcMilPay(pg, entries, rates, days);
        g.perDiem = pax * (pdRates.lodging + pdRates.mie) * days;
        g.travel = pax * travel.airfarePerPerson + rentalCost;
        g.subtotal = g.milPay + g.perDiem + g.travel;
        unitCalc.whiteCellRpa = g;
        result.totalWhiteCell += pax;
        if (pg.isLongTour) result.rpaTravel += g.travel;
      } else if (isWhiteCell && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, days);
        g.perDiem = pax * (pdRates.lodging + pdRates.mie) * days;
        g.travel = pax * travel.airfarePerPerson + rentalCost;
        g.subtotal = g.perDiem + g.travel;
        unitCalc.whiteCellOm = g;
        result.totalWhiteCell += pax;
      } else if (isPlayer && pg.fundingType === 'RPA') {
        const g = emptyGroup(pax, days);
        g.milPay = calcMilPay(pg, entries, rates, days);
        g.meals = pax * mealsPerDay * days;
        if (pg.isLongTour) {
          g.travel = pax * travel.airfarePerPerson;
          result.rpaTravel += g.travel;
        }
        g.subtotal = g.milPay + g.meals + g.travel;
        unitCalc.playerRpa = g;
        result.totalPlayers += pax;
      } else if (isPlayer && pg.fundingType === 'OM') {
        const g = emptyGroup(pax, days);
        const nights = Math.max(days - 1, 0);
        g.billeting = pax * rates.playerBilletingPerNight * nights;
        g.subtotal = g.billeting;
        unitCalc.playerOm = g;
        result.totalPlayers += pax;
      }
    }

    // Execution cost lines
    for (const cl of ub.executionCostLines || []) {
      if (cl.fundingType === 'RPA') unitCalc.executionRpa += cl.amount;
      else unitCalc.executionOm += cl.amount;
    }

    unitCalc.unitTotalRpa = unitCalc.whiteCellRpa.subtotal + unitCalc.playerRpa.subtotal + unitCalc.executionRpa;
    unitCalc.unitTotalOm = unitCalc.whiteCellOm.subtotal + unitCalc.playerOm.subtotal + unitCalc.executionOm;
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
  result.totalPax = result.totalPlayers + result.totalWhiteCell;

  return result;
}
