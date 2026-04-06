import { Card, Table, Typography } from 'antd';
import { useApp } from '../components/AppLayout';
import BudgetOverviewSection from '../components/BudgetOverviewSection';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { ANNUAL_TOUR_MEALS_LABEL, ANNUAL_TOUR_MIL_PAY_LABEL, ANNUAL_TOUR_TRAVEL_PAY_LABEL, getPlayerOmResponsibilityByUnit, getRpaCategoryTotals, getUnitRpaCategoryTotals } from '../utils/budgetSummary';
import { ReportsPage } from './Reports';
import type { ExecutionCostLine, FundingType, PersonnelEntry, PersonnelGroup, UnitBudget, UnitCalc } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const DAYS_PER_MONTH = 30;

const LOCATION_LABELS: Record<string, string> = {
  GULFPORT: 'Gulfport',
  CAMP_SHELBY: 'Camp Shelby',
  WARNER_ROBINS: 'Robins AFB',
  ROBINS_AFB: 'Robins AFB',
  MARIETTA: 'Dobbins ARB',
  DOBBINS_ARB: 'Dobbins ARB',
};

type ProjectionCell = {
  total: number;
  breakdowns: Array<{ label: string; amount: number }>;
  details: string[];
  hidden?: boolean;
};

type ProjectionRow = {
  key: string;
  rpaMilPay: ProjectionCell;
  planningOm: ProjectionCell;
  rpaTravelAndPerDiem: ProjectionCell;
  rpaMeals: ProjectionCell;
  annualTour: ProjectionCell;
  playerOm: ProjectionCell;
  executionOm: ProjectionCell;
};

type ProjectionFieldKey =
  | 'rpaMilPay'
  | 'planningOm'
  | 'rpaTravelAndPerDiem'
  | 'rpaMeals'
  | 'annualTour'
  | 'playerOm'
  | 'executionOm';

type MealResponsibilityContext = {
  totalExerciseWideMeals: number;
  totalExerciseWidePlayerMeals: number;
  totalExerciseWideAnnualTourMeals: number;
};

type PlayerOmResponsibilityContext = ReturnType<typeof getPlayerOmResponsibilityByUnit>;

function pluralize(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLocation(location: string | null | undefined): string {
  const normalized = String(location || '').trim().toUpperCase();
  if (!normalized) return 'Unknown Location';
  return LOCATION_LABELS[normalized] || toTitleCase(normalized.replace(/_/g, ' '));
}

function formatExecutionCategory(category: string | null | undefined): string {
  const normalized = String(category || '').trim().toUpperCase();
  if (normalized === 'UFR' || normalized === 'WRM') return 'WRM (10%)';
  if (normalized === 'GPC_PURCHASES') return 'GPC Purchases';
  if (!normalized) return 'Execution Cost';
  return toTitleCase(normalized.replace(/_/g, ' '));
}

function formatDuration(dutyDays: number | null | undefined): string {
  const days = Number(dutyDays || 0);
  if (!days) return '0 days';
  const months = days / DAYS_PER_MONTH;
  return Number.isInteger(months) ? pluralize(months, 'month') : pluralize(days, 'day');
}

function buildPersonnelDetail(
  entry: Partial<PersonnelEntry>,
  group: PersonnelGroup,
  defaultDutyDays: number,
  prefix?: string,
): string | null {
  const count = Number(entry.count ?? group.paxCount ?? 0);
  if (count <= 0) return null;

  const rank = String(entry.rankCode || 'Personnel').toUpperCase();
  const duration = formatDuration(entry.dutyDays ?? group.dutyDays ?? defaultDutyDays);
  const location = formatLocation(entry.location ?? group.location);
  const locality = (entry.isLocal ?? group.isLocal) ? 'Local' : 'Not local';
  const note = String(entry.note || '').trim();
  const travelOnly = entry.travelOnly ? ' - Travel only' : '';
  const detail = `${count} ${rank} - ${duration} - ${location} - ${locality}${travelOnly}${note ? ` (${note})` : ''}`;

  return prefix ? `${prefix} - ${detail}` : detail;
}

function getPersonnelDetails(groups: PersonnelGroup[], defaultDutyDays: number, includeRolePrefix = false): string[] {
  return groups.flatMap((group) => {
    const fallbackEntry: Partial<PersonnelEntry> = {
      count: group.paxCount || 0,
      dutyDays: group.dutyDays ?? defaultDutyDays,
      location: group.location,
      isLocal: group.isLocal,
    };
    const entries = group.personnelEntries.length > 0 ? group.personnelEntries : [fallbackEntry];
    const prefix = includeRolePrefix ? (group.role === 'SUPPORT' ? 'Support' : 'Support Personnel - Execution') : undefined;

    return entries
      .map((entry) => buildPersonnelDetail(entry, group, defaultDutyDays, prefix))
      .filter((detail): detail is string => !!detail);
  });
}

function getExecutionLineDetails(lines: ExecutionCostLine[]): string[] {
  return lines.map((line) => {
    const category = formatExecutionCategory(line.category);
    const notes = String(line.notes || '').trim();
    const normalizedNotes = notes.toLowerCase();
    const shouldShowNotes = notes
      && !normalizedNotes.startsWith('a7_wrm_overall:')
      && normalizedNotes !== 'gpc purchases o&m cost'
      && normalizedNotes !== category.toLowerCase();

    return shouldShowNotes ? `${category} - ${notes} - ${fmt(line.amount || 0)}` : `${category} - ${fmt(line.amount || 0)}`;
  });
}

function buildProjectionCell(
  total: number,
  personnelGroups: PersonnelGroup[],
  defaultDutyDays: number,
  executionLines: ExecutionCostLine[] = [],
  includeRolePrefix = false,
  breakdowns: Array<{ label: string; amount: number }> = [],
  hidden = false,
): ProjectionCell {
  return {
    total,
    breakdowns,
    hidden,
    details: [
      ...getPersonnelDetails(personnelGroups, defaultDutyDays, includeRolePrefix),
      ...getExecutionLineDetails(executionLines),
    ],
  };
}

function renderProjectionCell(value: ProjectionCell) {
  if (value.hidden) {
    return null;
  }

  return (
    <div style={{ minHeight: 92 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {fmt(value.total)}
      </Typography.Text>
      {value.breakdowns.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: value.details.length > 0 ? 8 : 0 }}>
          {value.breakdowns.map((breakdown) => (
            <Typography.Text key={`${breakdown.label}-${breakdown.amount}`} style={{ fontSize: 12, lineHeight: 1.35, color: '#596577' }}>
              {breakdown.label}: {fmt(breakdown.amount)}
            </Typography.Text>
          ))}
        </div>
      ) : null}
      {value.details.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.details.map((detail) => (
            <Typography.Text key={detail} style={{ fontSize: 12, lineHeight: 1.4 }}>
              {detail}
            </Typography.Text>
          ))}
        </div>
      ) : value.breakdowns.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          No entries yet
        </Typography.Text>
      ) : null}
    </div>
  );
}

const projectionSections: Array<{ key: ProjectionFieldKey; label: string }> = [
  { key: 'rpaMilPay', label: 'RPA Mil Pay' },
  { key: 'planningOm', label: 'Planning O&M' },
  { key: 'rpaTravelAndPerDiem', label: 'RPA Travel & Per Diem' },
  { key: 'rpaMeals', label: 'RPA Meals' },
  { key: 'annualTour', label: 'Annual Tour' },
  { key: 'playerOm', label: 'Player O&M' },
  { key: 'executionOm', label: 'Execution O&M' },
];

function findGroups(unitBudget: UnitBudget | undefined, role: string, fundingType: FundingType): PersonnelGroup[] {
  return (unitBudget?.personnelGroups || []).filter(
    (group) => group.role === role && group.fundingType === fundingType,
  );
}

function findExecutionGroups(unitBudget: UnitBudget | undefined, fundingType: FundingType): PersonnelGroup[] {
  return (unitBudget?.personnelGroups || []).filter(
    (group) => (group.role === 'WHITE_CELL' || group.role === 'SUPPORT') && group.fundingType === fundingType,
  );
}

function findExecutionLines(unitBudget: UnitBudget | undefined, fundingType: FundingType): ExecutionCostLine[] {
  return (unitBudget?.executionCostLines || []).filter((line) => line.fundingType === fundingType);
}

function buildProjectionRow(
  unitBudget: UnitBudget | undefined,
  unitCalc: UnitCalc,
  defaultDutyDays: number,
  mealResponsibility: MealResponsibilityContext,
  playerOmResponsibility: PlayerOmResponsibilityContext,
): ProjectionRow {
  const planningRpaGroups = findGroups(unitBudget, 'PLANNING', 'RPA');
  const planningOmGroups = findGroups(unitBudget, 'PLANNING', 'OM');
  const playerRpaGroups = findGroups(unitBudget, 'PLAYER', 'RPA');
  const annualTourRpaGroups = findGroups(unitBudget, 'ANNUAL_TOUR', 'RPA');
  const playerOmGroups = findGroups(unitBudget, 'PLAYER', 'OM');
  const executionRpaGroups = findExecutionGroups(unitBudget, 'RPA');
  const executionOmGroups = findExecutionGroups(unitBudget, 'OM');
  const rpaGroups = [...planningRpaGroups, ...playerRpaGroups, ...executionRpaGroups];
  const rpaCategoryTotals = getUnitRpaCategoryTotals(unitCalc);
  const playerMeals = unitCalc.playerRpa.meals || 0;
  const annualTourMilPay = unitCalc.annualTourRpa?.milPay || 0;
  const annualTourTravelPay = (unitCalc.annualTourRpa?.travel || 0) + (unitCalc.annualTourRpa?.perDiem || 0);
  const normalizedUnitCode = String(unitCalc.unitCode || '').toUpperCase();
  const isA7 = normalizedUnitCode === 'A7';
  const assignedMealsTotal = isA7 ? mealResponsibility.totalExerciseWideMeals : 0;
  const executionRpaLines = findExecutionLines(unitBudget, 'RPA');
  const executionOmLines = findExecutionLines(unitBudget, 'OM');
  const annualTourBilletingOm = unitCalc.annualTourRpa?.billeting || 0;
  const playerOmTotals = playerOmResponsibility[normalizedUnitCode] || { total: 0, billeting: 0, nonBilleting: 0 };

  return {
    key: unitCalc.unitCode,
    rpaMilPay: buildProjectionCell(
      rpaCategoryTotals.milPay,
      rpaGroups,
      defaultDutyDays,
      [],
      false,
      [{ label: 'RPA Mil Pay', amount: rpaCategoryTotals.milPay }],
    ),
    planningOm: buildProjectionCell(unitCalc.planningOm.subtotal, planningOmGroups, defaultDutyDays),
    rpaTravelAndPerDiem: buildProjectionCell(
      rpaCategoryTotals.travelAndPerDiem,
      rpaGroups,
      defaultDutyDays,
      executionRpaLines,
      false,
      [{ label: 'RPA Travel & Per Diem', amount: rpaCategoryTotals.travelAndPerDiem }],
    ),
    rpaMeals: buildProjectionCell(
      assignedMealsTotal,
      isA7 ? [...playerRpaGroups, ...annualTourRpaGroups] : [],
      defaultDutyDays,
      [],
      false,
      [
        ...(isA7 && mealResponsibility.totalExerciseWidePlayerMeals > 0
          ? [{ label: 'Player Meals', amount: mealResponsibility.totalExerciseWidePlayerMeals }]
          : []),
        ...(isA7 && mealResponsibility.totalExerciseWideAnnualTourMeals > 0
          ? [{ label: ANNUAL_TOUR_MEALS_LABEL, amount: mealResponsibility.totalExerciseWideAnnualTourMeals }]
          : []),
      ],
      !isA7,
    ),
    annualTour: buildProjectionCell(
      annualTourMilPay + annualTourTravelPay,
      annualTourRpaGroups,
      defaultDutyDays,
      [],
      false,
      [
        ...(annualTourMilPay > 0 ? [{ label: ANNUAL_TOUR_MIL_PAY_LABEL, amount: annualTourMilPay }] : []),
        ...(annualTourTravelPay > 0 ? [{ label: ANNUAL_TOUR_TRAVEL_PAY_LABEL, amount: annualTourTravelPay }] : []),
      ],
    ),
    playerOm: buildProjectionCell(
      playerOmTotals.total + annualTourBilletingOm,
      playerOmGroups,
      defaultDutyDays,
      [],
      false,
      [
        ...(playerOmTotals.billeting > 0 ? [{ label: 'Player Billeting (O&M)', amount: playerOmTotals.billeting }] : []),
        ...(annualTourBilletingOm > 0 ? [{ label: 'AT Billeting (O&M)', amount: annualTourBilletingOm }] : []),
      ],
    ),
    executionOm: buildProjectionCell(
      (unitCalc.whiteCellOm?.subtotal || 0) + unitCalc.executionOm,
      executionOmGroups,
      defaultDutyDays,
      executionOmLines,
      true,
    ),
  };
}

function A7RpaFundingSummary() {
  const { budget } = useApp();

  if (!budget) return null;

  const rpaCategoryTotals = getRpaCategoryTotals(budget);

  const summaryItems = [
    { label: 'RPA Mil Pay', value: rpaCategoryTotals.milPay },
    { label: 'RPA Travel & Per Diem', value: rpaCategoryTotals.travelAndPerDiem },
    { label: 'RPA Meals', value: rpaCategoryTotals.meals },
  ];

  return (
    <Card title="A7 RPA Funding Responsibility" className="ct-section-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Exercise-Wide RPA Paid By A7
            </Typography.Text>
            <Typography.Title level={2} style={{ margin: '4px 0 0', color: '#1677ff' }}>
              {fmt(budget.totalRpa)}
            </Typography.Title>
          </div>
          <Typography.Text type="secondary" style={{ maxWidth: 560, textAlign: 'right' }}>
            Projection note: unit rows still show where costs occur, but A7 is the paying office for the full exercise RPA requirement.
          </Typography.Text>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {summaryItems.map((item) => (
            <div
              key={item.label}
              style={{
                border: '1px solid #e8ecf1',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#fafcff',
              }}
            >
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                {item.label}
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 20, color: '#1a1a2e' }}>
                {fmt(item.value)}
              </Typography.Text>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Pm27UnitProjectionTables() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return null;

  const units = Object.values(budget.units).sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode));
  const mealResponsibility: MealResponsibilityContext = {
    totalExerciseWideMeals: Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.playerRpa?.meals || 0) + (unit.annualTourRpa?.meals || 0), 0),
    totalExerciseWidePlayerMeals: Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.playerRpa?.meals || 0), 0),
    totalExerciseWideAnnualTourMeals: Object.values(budget.units)
      .reduce((sum, unit) => sum + (unit.annualTourRpa?.meals || 0), 0),
  };
  const playerOmResponsibility = getPlayerOmResponsibilityByUnit(budget);
  const unitBudgetsByCode = new Map(
    (exercise.unitBudgets || []).map((unitBudget) => [String(unitBudget.unitCode || '').toUpperCase(), unitBudget]),
  );

  const columns = [
    { title: 'RPA Mil Pay', dataIndex: 'rpaMilPay', key: 'rpaMilPay', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Planning O&M', dataIndex: 'planningOm', key: 'planningOm', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'RPA Travel & Per Diem', dataIndex: 'rpaTravelAndPerDiem', key: 'rpaTravelAndPerDiem', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'RPA Meals', dataIndex: 'rpaMeals', key: 'rpaMeals', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Annual Tour', dataIndex: 'annualTour', key: 'annualTour', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Player O&M', dataIndex: 'playerOm', key: 'playerOm', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Execution O&M', dataIndex: 'executionOm', key: 'executionOm', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {units.map((unit) => {
        const projectionRow = buildProjectionRow(
          unitBudgetsByCode.get(String(unit.unitCode || '').toUpperCase()),
          unit,
          exercise.defaultDutyDays || 1,
          mealResponsibility,
          playerOmResponsibility,
        );

        return (
          <Card
            key={unit.unitCode}
            title={getUnitDisplayLabel(unit.unitCode)}
            className="ct-section-card"
            style={{ marginBottom: 16 }}
          >
            <div className="ct-table ct-screen-only">
              <Table
                size="small"
                pagination={false}
                columns={columns}
                scroll={{ x: 1720 }}
                dataSource={[projectionRow]}
              />
            </div>
            <div className="ct-print-only ct-pm27-print-grid">
              {projectionSections.map((section) => {
                const cell = projectionRow[section.key];
                if (cell.hidden) return null;
                return (
                  <div key={section.key} className="ct-pm27-print-item">
                    <div className="ct-pm27-print-item-header">
                      <div className="ct-pm27-print-item-label">{section.label}</div>
                      <div className="ct-pm27-print-item-total">{fmt(cell.total)}</div>
                    </div>
                    {cell.breakdowns.length > 0 ? (
                      <div className="ct-pm27-print-item-details">
                        {cell.breakdowns.map((breakdown) => (
                          <div key={`${breakdown.label}-${breakdown.amount}`} className="ct-pm27-print-item-detail">
                            {breakdown.label}: {fmt(breakdown.amount)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {cell.details.length > 0 ? (
                      <div className="ct-pm27-print-item-details">
                        {cell.details.map((detail) => (
                          <div key={detail} className="ct-pm27-print-item-detail">
                            {detail}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ct-pm27-print-item-empty">No entries yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function Pm27CostProjections() {
  return (
    <ReportsPage
      title="PM 27 Cost Projections"
      showBudgetDetails={false}
      showGrandTotals={false}
      beforeBudgetBreakdownSection={<BudgetOverviewSection />}
      extraSections={(
        <>
          <A7RpaFundingSummary />
          <Pm27UnitProjectionTables />
        </>
      )}
    />
  );
}
