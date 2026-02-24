// ──────────── Enums ────────────
export type UnitCode = string;
export type PersonnelRole = 'PLAYER' | 'WHITE_CELL' | 'PLANNING' | 'SUPPORT';
export type FundingType = 'RPA' | 'OM';
export type Location = string;
export type OmCategory =
  | 'CONTRACT'
  | 'TRANSPORTATION'
  | 'BILLETING'
  | 'PORT_A_POTTY'
  | 'RENTALS_VSCOS'
  | 'CONSUMABLES'
  | 'WRM'
  | 'OTHER';

// ──────────── Models ────────────
export interface Exercise {
  id: string;
  ownerUserId?: string;
  name: string;
  totalBudget: number;
  startDate: string;
  endDate: string;
  defaultDutyDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseDetail extends Exercise {
  unitBudgets: UnitBudget[];
  travelConfig: TravelConfig | null;
  omCostLines: OmCostLine[];
}

export interface UnitBudget {
  id: string;
  exerciseId: string;
  unitCode: UnitCode;
  personnelGroups: PersonnelGroup[];
  executionCostLines: ExecutionCostLine[];
}

export interface PersonnelGroup {
  id: string;
  unitBudgetId: string;
  role: PersonnelRole;
  fundingType: FundingType;
  paxCount: number;
  dutyDays: number | null;
  location: Location | null;
  isLongTour: boolean;
  isLocal: boolean;
  airfarePerPerson: number | null;
  rentalCarCount: number;
  rentalCarDaily: number | null;
  rentalCarDays: number;
  avgCpdOverride: number | null;
  personnelEntries: PersonnelEntry[];
}

export interface PersonnelEntry {
  id: string;
  personnelGroupId: string;
  rankCode: string;
  count: number;
  dutyDays: number | null;
  location: Location | null;
  isLocal: boolean;
}

export interface TravelConfig {
  id: string;
  exerciseId: string;
  airfarePerPerson: number;
  rentalCarDailyRate: number;
  rentalCarCount: number;
  rentalCarDays: number;
}

export interface ExecutionCostLine {
  id: string;
  unitBudgetId: string;
  fundingType: FundingType;
  category: string;
  amount: number;
  notes: string | null;
}

export interface OmCostLine {
  id: string;
  exerciseId: string;
  category: OmCategory;
  label: string;
  amount: number;
  notes: string | null;
}

export interface RankCpdRate {
  id: string;
  rankCode: string;
  costPerDay: number;
  effectiveDate: string;
}

export interface PerDiemRate {
  id: string;
  location: Location;
  lodgingRate: number;
  mieRate: number;
  effectiveDate: string;
}

export interface PerDiemMasterRecord {
  id: string;
  state: string;
  destination: string;
  countyOrLocationDefined: string;
  seasonBegin: string;
  seasonEnd: string;
  fy26LodgingRate: number;
  fy26Mie: number;
}

export interface PerDiemMasterData {
  title: string;
  sourceFile: string;
  generatedAt: string;
  recordCount: number;
  records: PerDiemMasterRecord[];
}

// ──────────── Calculation Result ────────────
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

export interface AuthUser {
  id: string;
  username: string;
  name: string;
}
