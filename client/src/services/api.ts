import type {
  Exercise,
  ExerciseDetail,
  BudgetResult,
  RankCpdRate,
  PerDiemRate,
  PersonnelGroup,
  PersonnelEntry,
  ExecutionCostLine,
  OmCostLine,
  TravelConfig,
  UnitBudget,
  PerDiemMasterData,
  PerDiemMasterRecord,
  AuthUser,
} from '../types';
import { clearAuthSession, getAuthToken, getRefreshToken, setAuthSession } from './auth';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '/api/v1';

let perDiemMasterCache: PerDiemMasterRecord[] | null = null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  includeAuth?: boolean;
  retryOnAuthFail?: boolean;
}

interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuthSession();
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        clearAuthSession();
        return false;
      }

      const data = await response.json() as AuthResponse;
      if (!data.token || !data.user) {
        clearAuthSession();
        return false;
      }

      setAuthSession(data.token, data.user, data.refreshToken);
      return true;
    } catch {
      clearAuthSession();
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.includeAuth !== false) {
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && options.includeAuth !== false && options.retryOnAuthFail !== false) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, retryOnAuthFail: false });
      }
    }

    if (response.status === 401) {
      clearAuthSession();
    }

    let message = `Request failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.error) message = String(errorData.error);
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function registerAccount(data: { username: string; password: string; name?: string }): Promise<AuthUser> {
  const result = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: data,
    includeAuth: false,
  });
  setAuthSession(result.token, result.user, result.refreshToken);
  return result.user;
}

export async function loginAccount(data: { username: string; password: string }): Promise<AuthUser> {
  const result = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: data,
    includeAuth: false,
  });
  setAuthSession(result.token, result.user, result.refreshToken);
  return result.user;
}

export async function logoutAccount(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await apiRequest<void>('/auth/logout', {
        method: 'POST',
        includeAuth: false,
        body: { refreshToken },
      });
    } catch {
      // ignore network/server logout failures and clear local session regardless
    }
  }

  clearAuthSession();
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me');
}

function findGroup(unit: UnitBudget, role: string, fundingType: string): PersonnelGroup | undefined {
  return unit.personnelGroups.find((group) => group.role === role && group.fundingType === fundingType);
}

// ── Exercises ──
export async function getExercises(): Promise<Exercise[]> {
  return apiRequest<Exercise[]>('/exercises');
}

export async function getExercise(id: string): Promise<ExerciseDetail> {
  return apiRequest<ExerciseDetail>(`/exercises/${id}`);
}

export async function createExercise(data: {
  name: string;
  totalBudget: number;
  startDate: string;
  endDate: string;
  defaultDutyDays: number;
}): Promise<ExerciseDetail> {
  return apiRequest<ExerciseDetail>('/exercises', { method: 'POST', body: data });
}

export async function updateExercise(id: string, data: Partial<Exercise>): Promise<Exercise> {
  return apiRequest<Exercise>(`/exercises/${id}`, { method: 'PUT', body: data });
}

export async function deleteExercise(id: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/exercises/${id}`, { method: 'DELETE' });
}

export async function addUnitBudget(
  exerciseId: string,
  data: { unitCode: string; template?: 'STANDARD' | 'A7' },
): Promise<ExerciseDetail> {
  return apiRequest<ExerciseDetail>(`/exercises/${exerciseId}/units`, { method: 'POST', body: data });
}

export async function deleteUnitBudget(exerciseId: string, unitCode: string): Promise<ExerciseDetail> {
  return apiRequest<ExerciseDetail>(`/exercises/${exerciseId}/units/${encodeURIComponent(unitCode)}`, {
    method: 'DELETE',
  });
}

// ── Travel Config ──
export async function updateTravelConfig(exerciseId: string, data: Partial<TravelConfig>): Promise<TravelConfig> {
  return apiRequest<TravelConfig>(`/exercises/${exerciseId}/travel`, { method: 'PUT', body: data });
}

// ── Calculate budget ──
export async function calculateBudget(exerciseId: string): Promise<BudgetResult> {
  return apiRequest<BudgetResult>(`/exercises/${exerciseId}/calculate`);
}

// ── Personnel Groups ──
export async function updatePersonnelGroup(groupId: string, data: Partial<PersonnelGroup>): Promise<PersonnelGroup> {
  return apiRequest<PersonnelGroup>(`/personnel-groups/${groupId}`, { method: 'PUT', body: data });
}

// ── Personnel Entries ──
export async function addPersonnelEntry(
  groupId: string,
  data: { rankCode: string; count: number; dutyDays?: number | null; location?: string | null; isLocal?: boolean },
): Promise<PersonnelEntry> {
  return apiRequest<PersonnelEntry>(`/personnel-groups/${groupId}/entries`, { method: 'POST', body: data });
}

export async function updatePersonnelEntry(
  entryId: string,
  data: Partial<Pick<PersonnelEntry, 'rankCode' | 'count' | 'dutyDays' | 'location' | 'isLocal'>>,
): Promise<PersonnelEntry> {
  return apiRequest<PersonnelEntry>(`/personnel-entries/${entryId}`, { method: 'PUT', body: data });
}

export async function deletePersonnelEntry(entryId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/personnel-entries/${entryId}`, { method: 'DELETE' });
}

// ── Execution Cost Lines ──
export async function addExecutionCost(
  unitId: string,
  data: { fundingType: string; category: string; amount: number; notes?: string | null },
): Promise<ExecutionCostLine> {
  return apiRequest<ExecutionCostLine>(`/units/${unitId}/execution-costs`, { method: 'POST', body: data });
}

export async function deleteExecutionCost(lineId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/execution-costs/${lineId}`, { method: 'DELETE' });
}

// ── O&M Cost Lines ──
export async function addOmCost(
  exerciseId: string,
  data: { category: string; label: string; amount: number; notes?: string | null },
): Promise<OmCostLine> {
  return apiRequest<OmCostLine>(`/exercises/${exerciseId}/om-costs`, { method: 'POST', body: data });
}

export async function deleteOmCost(lineId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/om-costs/${lineId}`, { method: 'DELETE' });
}

// ── Rates ──
const RANK_ORDER = ['AB','AMN','A1C','SRA','SSGT','TSGT','MSGT','SMSGT','CMSGT','2LT','1LT','CAPT','MAJ','LTCOL','COL','BG','MG'];

export async function getCpdRates(): Promise<RankCpdRate[]> {
  const rates = await apiRequest<RankCpdRate[]>('/rates/cpd');
  rates.sort((a, b) => {
    const ai = RANK_ORDER.indexOf(a.rankCode);
    const bi = RANK_ORDER.indexOf(b.rankCode);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return rates;
}

export async function updateCpdRates(rates: { rankCode: string; costPerDay: number }[]): Promise<RankCpdRate[]> {
  return apiRequest<RankCpdRate[]>('/rates/cpd', { method: 'PUT', body: { rates } });
}

export async function getPerDiemRates(): Promise<PerDiemRate[]> {
  return apiRequest<PerDiemRate[]>('/rates/per-diem');
}

export async function updatePerDiemRates(rates: { location: string; lodgingRate: number; mieRate: number }[]): Promise<PerDiemRate[]> {
  return apiRequest<PerDiemRate[]>('/rates/per-diem', { method: 'PUT', body: { rates } });
}

export function normalizePerDiemLocation(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function addPerDiemRate(location: string, lodgingRate: number, mieRate: number): Promise<PerDiemRate[]> {
  const normalizedLocation = normalizePerDiemLocation(location);
  if (!normalizedLocation) throw new Error('Location is required');

  const current = await getPerDiemRates();
  const existing = current.find((row) => row.location === normalizedLocation);
  const next = existing
    ? current.map((row) => row.location === normalizedLocation ? { location: row.location, lodgingRate, mieRate } : { location: row.location, lodgingRate: row.lodgingRate, mieRate: row.mieRate })
    : [...current.map((row) => ({ location: row.location, lodgingRate: row.lodgingRate, mieRate: row.mieRate })), { location: normalizedLocation, lodgingRate, mieRate }];

  return updatePerDiemRates(next);
}

export async function deletePerDiemRate(id: string): Promise<PerDiemRate[]> {
  const current = await getPerDiemRates();
  const next = current.filter((row) => row.id !== id).map((row) => ({
    location: row.location,
    lodgingRate: row.lodgingRate,
    mieRate: row.mieRate,
  }));

  return updatePerDiemRates(next);
}

export async function addOrUpdatePerDiemRate(location: string, lodgingRate: number, mieRate: number): Promise<PerDiemRate[]> {
  return addPerDiemRate(location, lodgingRate, mieRate);
}

export async function getPerDiemMasterRates(): Promise<PerDiemMasterRecord[]> {
  if (perDiemMasterCache) return perDiemMasterCache;

  const response = await fetch('/FY2026_PerDiemMasterRatesFile.json');
  if (!response.ok) {
    throw new Error('Unable to load FY2026 per diem dataset');
  }

  const data = (await response.json()) as PerDiemMasterData;
  const records = Array.isArray(data.records) ? data.records : [];

  perDiemMasterCache = records
    .filter((row) => typeof row.destination === 'string' && row.destination.trim().length > 0)
    .sort((a, b) => `${a.state} ${a.destination}`.localeCompare(`${b.state} ${b.destination}`));

  return perDiemMasterCache;
}

export async function getAppConfig(): Promise<Record<string, string>> {
  return apiRequest<Record<string, string>>('/rates/config');
}

export async function updateAppConfig(config: Record<string, string>): Promise<Record<string, string>> {
  return apiRequest<Record<string, string>>('/rates/config', { method: 'PUT', body: config });
}

// ── Excel Export (server-side) ──
export async function exportExcel(exerciseId: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/exercises/${exerciseId}/export`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`Export failed (${response.status})`);

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') || '';
  const fileNameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const fileName = fileNameMatch?.[1] || `exercise_${exerciseId}_budget.xlsx`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── JSON Import / Export ──
export async function exportAllData(): Promise<string> {
  const exercises = await getExercises();
  const fullExercises = await Promise.all(exercises.map((exercise) => getExercise(exercise.id)));

  const unitBudgets = fullExercises.flatMap((exercise) =>
    exercise.unitBudgets.map((unit) => ({
      id: unit.id,
      exerciseId: exercise.id,
      unitCode: unit.unitCode,
    })),
  );

  const personnelGroups = fullExercises.flatMap((exercise) =>
    exercise.unitBudgets.flatMap((unit) =>
      unit.personnelGroups.map((group) => ({
        id: group.id,
        unitBudgetId: unit.id,
        role: group.role,
        fundingType: group.fundingType,
        paxCount: group.paxCount,
        dutyDays: group.dutyDays,
        location: group.location,
        isLongTour: group.isLongTour,
        avgCpdOverride: group.avgCpdOverride,
      })),
    ),
  );

  const personnelEntries = fullExercises.flatMap((exercise) =>
    exercise.unitBudgets.flatMap((unit) =>
      unit.personnelGroups.flatMap((group) =>
        group.personnelEntries.map((entry) => ({
          id: entry.id,
          personnelGroupId: group.id,
          rankCode: entry.rankCode,
          count: entry.count,
          dutyDays: entry.dutyDays,
          location: entry.location,
          isLocal: entry.isLocal,
        })),
      ),
    ),
  );

  const travelConfigs = fullExercises
    .filter((exercise) => exercise.travelConfig)
    .map((exercise) => exercise.travelConfig!);

  const executionCostLines = fullExercises.flatMap((exercise) =>
    exercise.unitBudgets.flatMap((unit) => unit.executionCostLines),
  );

  const omCostLines = fullExercises.flatMap((exercise) => exercise.omCostLines);

  const data = {
    exercises,
    unitBudgets,
    personnelGroups,
    personnelEntries,
    travelConfigs,
    executionCostLines,
    omCostLines,
    rankCpdRates: await getCpdRates(),
    perDiemRates: await getPerDiemRates(),
    appConfig: Object.entries(await getAppConfig()).map(([key, value]) => ({ key, value })),
  };

  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json) as {
    exercises?: Exercise[];
    unitBudgets?: Array<{ id: string; exerciseId: string; unitCode: string }>;
    personnelGroups?: Array<{
      id: string;
      unitBudgetId: string;
      role: string;
      fundingType: string;
      paxCount: number;
      dutyDays: number | null;
      location: string | null;
      isLongTour: boolean;
      avgCpdOverride: number | null;
    }>;
    personnelEntries?: Array<{
      personnelGroupId: string;
      rankCode: string;
      count: number;
      dutyDays?: number | null;
      location?: string | null;
      isLocal?: boolean;
    }>;
    travelConfigs?: Array<{
      exerciseId: string;
      airfarePerPerson: number;
      rentalCarDailyRate: number;
      rentalCarCount: number;
      rentalCarDays: number;
    }>;
    executionCostLines?: Array<{
      unitBudgetId: string;
      fundingType: string;
      category: string;
      amount: number;
      notes: string | null;
    }>;
    omCostLines?: Array<{
      exerciseId: string;
      category: string;
      label: string;
      amount: number;
      notes: string | null;
    }>;
    rankCpdRates?: Array<{ rankCode: string; costPerDay: number }>;
    perDiemRates?: Array<{ location: string; lodgingRate: number; mieRate: number }>;
    appConfig?: Array<{ key: string; value: string }>;
  };

  const currentExercises = await getExercises();
  for (const exercise of currentExercises) {
    await deleteExercise(exercise.id);
  }

  if (data.rankCpdRates?.length) {
    await updateCpdRates(data.rankCpdRates.map((row) => ({ rankCode: row.rankCode, costPerDay: row.costPerDay })));
  }

  if (data.perDiemRates?.length) {
    await updatePerDiemRates(
      data.perDiemRates.map((row) => ({
        location: normalizePerDiemLocation(row.location),
        lodgingRate: row.lodgingRate,
        mieRate: row.mieRate,
      })),
    );
  }

  if (data.appConfig?.length) {
    await updateAppConfig(Object.fromEntries(data.appConfig.map((row) => [row.key, row.value])));
  }

  const sourceExercises = data.exercises || [];
  const sourceUnits = data.unitBudgets || [];
  const sourceGroups = data.personnelGroups || [];
  const sourceEntries = data.personnelEntries || [];
  const sourceTravel = data.travelConfigs || [];
  const sourceExec = data.executionCostLines || [];
  const sourceOm = data.omCostLines || [];

  for (const sourceExercise of sourceExercises) {
    let created = await createExercise({
      name: sourceExercise.name,
      totalBudget: sourceExercise.totalBudget ?? 0,
      startDate: sourceExercise.startDate,
      endDate: sourceExercise.endDate,
      defaultDutyDays: sourceExercise.defaultDutyDays,
    });

    const sourceExerciseUnits = sourceUnits.filter((unit) => unit.exerciseId === sourceExercise.id);
    for (const sourceUnit of sourceExerciseUnits) {
      const exists = created.unitBudgets.some((unit) => unit.unitCode === sourceUnit.unitCode);
      if (!exists) {
        const sourceUnitGroups = sourceGroups.filter((group) => group.unitBudgetId === sourceUnit.id);
        const wantsA7 = sourceUnitGroups.some((group) => group.role === 'PLANNING' || group.role === 'SUPPORT');
        created = await addUnitBudget(created.id, {
          unitCode: sourceUnit.unitCode,
          template: wantsA7 ? 'A7' : 'STANDARD',
        });
      }
    }

    const remoteByUnitCode = new Map(created.unitBudgets.map((unit) => [unit.unitCode, unit]));
    const sourceByUnitCode = new Map(sourceExerciseUnits.map((unit) => [unit.unitCode, unit]));

    const groupIdMap = new Map<string, string>();

    for (const [unitCode, remoteUnit] of remoteByUnitCode) {
      const sourceUnit = sourceByUnitCode.get(unitCode);
      if (!sourceUnit) continue;

      const sourceUnitGroups = sourceGroups.filter((group) => group.unitBudgetId === sourceUnit.id);
      const sourceUnitExec = sourceExec.filter((line) => line.unitBudgetId === sourceUnit.id);

      for (const sourceGroup of sourceUnitGroups) {
        const remoteGroup = findGroup(remoteUnit, sourceGroup.role, sourceGroup.fundingType);
        if (!remoteGroup) continue;

        groupIdMap.set(sourceGroup.id, remoteGroup.id);

        await updatePersonnelGroup(remoteGroup.id, {
          paxCount: sourceGroup.paxCount,
          dutyDays: sourceGroup.dutyDays,
          location: sourceGroup.location,
          isLongTour: sourceGroup.isLongTour,
          avgCpdOverride: sourceGroup.avgCpdOverride,
        });
      }

      for (const line of sourceUnitExec) {
        await addExecutionCost(remoteUnit.id, {
          fundingType: line.fundingType,
          category: line.category,
          amount: line.amount,
          notes: line.notes,
        });
      }
    }

    for (const sourceGroup of sourceGroups) {
      const mappedGroupId = groupIdMap.get(sourceGroup.id);
      if (!mappedGroupId) continue;
      const entries = sourceEntries.filter((entry) => entry.personnelGroupId === sourceGroup.id);
      for (const entry of entries) {
        await addPersonnelEntry(mappedGroupId, {
          rankCode: entry.rankCode,
          count: entry.count,
          dutyDays: entry.dutyDays ?? null,
          location: entry.location ?? null,
          isLocal: !!entry.isLocal,
        });
      }
    }

    const travel = sourceTravel.find((config) => config.exerciseId === sourceExercise.id);
    if (travel) {
      await updateTravelConfig(created.id, {
        airfarePerPerson: travel.airfarePerPerson,
        rentalCarDailyRate: travel.rentalCarDailyRate,
        rentalCarCount: travel.rentalCarCount,
        rentalCarDays: travel.rentalCarDays,
      });
    }

    for (const line of sourceOm.filter((row) => row.exerciseId === sourceExercise.id)) {
      await addOmCost(created.id, {
        category: line.category,
        label: line.label,
        amount: line.amount,
        notes: line.notes,
      });
    }
  }
}
