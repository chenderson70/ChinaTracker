import axios from 'axios';
import type {
  Exercise,
  ExerciseDetail,
  BudgetResult,
  RankCpdRate,
  PerDiemRate,
  ExecutionCostLine,
  OmCostLine,
  PersonnelGroup,
  PersonnelEntry,
  TravelConfig,
} from '../types';

const api = axios.create({ baseURL: '/api/v1' });

// ─── Exercises ───
export const getExercises = () => api.get<Exercise[]>('/exercises').then((r) => r.data);
export const getExercise = (id: string) => api.get<ExerciseDetail>(`/exercises/${id}`).then((r) => r.data);
export const createExercise = (data: { name: string; startDate: string; endDate: string; defaultDutyDays: number }) =>
  api.post<ExerciseDetail>('/exercises', data).then((r) => r.data);
export const updateExercise = (id: string, data: Partial<Exercise>) =>
  api.put<Exercise>(`/exercises/${id}`, data).then((r) => r.data);
export const deleteExercise = (id: string) => api.delete(`/exercises/${id}`);

// ─── Travel Config ───
export const updateTravelConfig = (exerciseId: string, data: Partial<TravelConfig>) =>
  api.put<TravelConfig>(`/exercises/${exerciseId}/travel`, data).then((r) => r.data);

// ─── Calculate ───
export const calculateBudget = (exerciseId: string) =>
  api.get<BudgetResult>(`/exercises/${exerciseId}/calculate`).then((r) => r.data);

// ─── Export ───
export const exportExcel = (exerciseId: string) =>
  api.get(`/exercises/${exerciseId}/export`, { responseType: 'blob' }).then((r) => {
    const url = window.URL.createObjectURL(new Blob([r.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Budget_Export.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  });

// ─── Personnel Groups ───
export const updatePersonnelGroup = (groupId: string, data: Partial<PersonnelGroup>) =>
  api.put<PersonnelGroup>(`/personnel-groups/${groupId}`, data).then((r) => r.data);

// ─── Personnel Entries ───
export const addPersonnelEntry = (groupId: string, data: { rankCode: string; count: number }) =>
  api.post<PersonnelEntry>(`/personnel-groups/${groupId}/entries`, data).then((r) => r.data);
export const updatePersonnelEntry = (entryId: string, data: Partial<PersonnelEntry>) =>
  api.put<PersonnelEntry>(`/personnel-entries/${entryId}`, data).then((r) => r.data);
export const deletePersonnelEntry = (entryId: string) => api.delete(`/personnel-entries/${entryId}`);

// ─── Execution Cost Lines ───
export const getExecutionCosts = (unitId: string) =>
  api.get<ExecutionCostLine[]>(`/units/${unitId}/execution-costs`).then((r) => r.data);
export const addExecutionCost = (unitId: string, data: Omit<ExecutionCostLine, 'id' | 'unitBudgetId'>) =>
  api.post<ExecutionCostLine>(`/units/${unitId}/execution-costs`, data).then((r) => r.data);
export const updateExecutionCost = (lineId: string, data: Partial<ExecutionCostLine>) =>
  api.put<ExecutionCostLine>(`/execution-costs/${lineId}`, data).then((r) => r.data);
export const deleteExecutionCost = (lineId: string) => api.delete(`/execution-costs/${lineId}`);

// ─── O&M Cost Lines ───
export const getOmCosts = (exerciseId: string) =>
  api.get<OmCostLine[]>(`/exercises/${exerciseId}/om-costs`).then((r) => r.data);
export const addOmCost = (exerciseId: string, data: Omit<OmCostLine, 'id' | 'exerciseId'>) =>
  api.post<OmCostLine>(`/exercises/${exerciseId}/om-costs`, data).then((r) => r.data);
export const updateOmCost = (lineId: string, data: Partial<OmCostLine>) =>
  api.put<OmCostLine>(`/om-costs/${lineId}`, data).then((r) => r.data);
export const deleteOmCost = (lineId: string) => api.delete(`/om-costs/${lineId}`);

// ─── Rates ───
export const getCpdRates = () => api.get<RankCpdRate[]>('/rates/cpd').then((r) => r.data);
export const updateCpdRates = (rates: { rankCode: string; costPerDay: number }[]) =>
  api.put<RankCpdRate[]>('/rates/cpd', { rates }).then((r) => r.data);

export const getPerDiemRates = () => api.get<PerDiemRate[]>('/rates/per-diem').then((r) => r.data);
export const updatePerDiemRates = (rates: { location: string; lodgingRate: number; mieRate: number }[]) =>
  api.put<PerDiemRate[]>('/rates/per-diem', { rates }).then((r) => r.data);

export const getAppConfig = () => api.get<Record<string, string>>('/rates/config').then((r) => r.data);
export const updateAppConfig = (config: Record<string, string>) =>
  api.put<Record<string, string>>('/rates/config', config).then((r) => r.data);
