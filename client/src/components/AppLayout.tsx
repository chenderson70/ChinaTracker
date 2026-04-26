import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Select,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Typography,
  message,
  Dropdown,
  Tooltip,
} from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SettingOutlined,
  FileExcelOutlined,
  PlusOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DownOutlined,
  DeleteOutlined,
  CopyOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ArrowRightOutlined,
  LogoutOutlined,
  EditOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as api from '../services/api';
import type {
  Exercise,
  ExerciseDetail,
  BudgetResult,
  ExerciseTemplate,
  ExerciseUndoSnapshot,
} from '../types';
import { getStoredUser } from '../services/auth';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { getDisplayedPax, getPlanningEventPaxExclusions } from '../utils/paxDisplay';
import {
  DEFAULT_EXERCISE_TEMPLATE,
  EXERCISE_TEMPLATE_OPTIONS,
  normalizeExerciseTemplate,
} from '../utils/exerciseTemplates';

const { Header, Sider, Content } = Layout;

interface AppCtx {
  exercise: ExerciseDetail | null;
  budget: BudgetResult | null;
  exerciseId: string | null;
  setExerciseId: (id: string | null) => void;
  refetchBudget: () => void;
  refetchExercise: () => void;
  pushUndoSnapshot: (label?: string) => Promise<void>;
}
export const AppContext = createContext<AppCtx>({
  exercise: null,
  budget: null,
  exerciseId: null,
  setExerciseId: () => {},
  refetchBudget: () => {},
  refetchExercise: () => {},
  pushUndoSnapshot: async () => {},
});
export const useApp = () => useContext(AppContext);

const MAX_UNDO_STEPS = 10;
type UndoEntry = {
  createdAt: number;
  label: string;
  serialized: string;
  snapshot: ExerciseUndoSnapshot;
};

function cloneUndoSnapshot(exercise: ExerciseDetail, appConfig: Record<string, string>): ExerciseUndoSnapshot {
  return JSON.parse(JSON.stringify({
    exercise,
    budgetTargets: {
      rpaBudgetTarget: String(appConfig.BUDGET_TARGET_RPA ?? ''),
      omBudgetTarget: String(appConfig.BUDGET_TARGET_OM ?? ''),
    },
  })) as ExerciseUndoSnapshot;
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const apiErrorNotifiedRef = useRef(false);
  const [exerciseId, setExerciseId] = useState<string | null>(localStorage.getItem('exerciseId'));
  const [undoStacks, setUndoStacks] = useState<Record<string, UndoEntry[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [removeUnitOpen, setRemoveUnitOpen] = useState(false);
  const [editExerciseOpen, setEditExerciseOpen] = useState(false);
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [form] = Form.useForm();
  const [unitForm] = Form.useForm();
  const [removeUnitForm] = Form.useForm();
  const [editExerciseForm] = Form.useForm();
  const [editBudgetForm] = Form.useForm();
  const editBudgetDraft = Form.useWatch([], editBudgetForm);

  // Fetch exercise list
  const {
    data: exercises = [],
    isFetched: exercisesFetched,
    isError: exercisesLoadError,
  } = useQuery({ queryKey: ['exercises'], queryFn: api.getExercises });
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });

  // Fetch current exercise detail
  const {
    data: exercise = null,
    refetch: refetchExercise,
    isError: exerciseLoadError,
  } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => api.getExercise(exerciseId!),
    enabled: !!exerciseId,
  });

  // Fetch budget
  const { data: budget = null, refetch: refetchBudget } = useQuery({
    queryKey: ['budget', exerciseId],
    queryFn: () => api.calculateBudget(exerciseId!),
    enabled: !!exerciseId,
  });
  const siteVisitPaxExclusions = getPlanningEventPaxExclusions(exercise);
  const displayTotalPax = budget
    ? getDisplayedPax(budget.totalPax, siteVisitPaxExclusions.totalExcludedPax)
    : 0;
  const currentUndoStack = exerciseId ? (undoStacks[exerciseId] || []) : [];
  const currentUndoEntry = currentUndoStack[currentUndoStack.length - 1];

  const pushUndoSnapshot = useCallback(async (label = 'Change') => {
    if (!exerciseId || !exercise) return;

    const snapshot = cloneUndoSnapshot(exercise, appConfig);
    const serialized = JSON.stringify(snapshot);

    setUndoStacks((current) => {
      const stack = current[exerciseId] || [];
      if (stack[stack.length - 1]?.serialized === serialized) {
        return current;
      }

      const nextStack = [
        ...stack,
        {
          createdAt: Date.now(),
          label,
          serialized,
          snapshot,
        },
      ].slice(-MAX_UNDO_STEPS);

      return {
        ...current,
        [exerciseId]: nextStack,
      };
    });
  }, [appConfig, exercise, exerciseId]);

  // Auto-select first exercise
  useEffect(() => {
    if (exercises.length === 0) {
      if (exercisesFetched && exerciseId) {
        setExerciseId(null);
      }
      return;
    }

    if (!exerciseId) {
      setExerciseId(exercises[0].id);
      return;
    }

    const exists = exercises.some((e) => e.id === exerciseId);
    if (!exists) {
      setExerciseId(exercises[0].id);
    }
  }, [exercises, exerciseId, exercisesFetched]);

  useEffect(() => {
    if (!exerciseId || !exerciseLoadError) return;
    setExerciseId(null);
    localStorage.removeItem('exerciseId');
    message.warning('Saved exercise could not be loaded. Please select or create an exercise.');
  }, [exerciseId, exerciseLoadError]);

  useEffect(() => {
    if (!exercisesLoadError || apiErrorNotifiedRef.current) return;
    apiErrorNotifiedRef.current = true;
    message.error('Unable to reach the API. Start the server and refresh.');
  }, [exercisesLoadError]);

  useEffect(() => {
    if (exerciseId) localStorage.setItem('exerciseId', exerciseId);
    else localStorage.removeItem('exerciseId');
  }, [exerciseId]);

  // Create exercise mutation
  const createMut = useMutation({
    mutationFn: api.createExercise,
    onSuccess: (ex) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setExerciseId(ex.id);
      setCreateOpen(false);
      form.resetFields();
      message.success('Exercise created');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to create exercise');
    },
  });

  const handleCreate = () => {
    form.validateFields().then((vals) => {
      createMut.mutate({
        name: vals.name,
        exerciseTemplate: vals.exerciseTemplate,
        startDate: vals.dates[0].format('YYYY-MM-DD'),
        endDate: vals.dates[1].format('YYYY-MM-DD'),
        defaultDutyDays: vals.defaultDutyDays,
      });
    });
  };

  const editExerciseMut = useMutation({
    mutationFn: async (data: {
      name: string;
      exerciseTemplate: ExerciseTemplate;
      startDate: string;
      endDate: string;
      defaultDutyDays: number;
    }) => {
      await pushUndoSnapshot('Edit Exercise');
      return api.updateExercise(exerciseId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      setEditExerciseOpen(false);
      message.success('Exercise updated');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to update exercise');
    },
  });

  const handleEditExercise = () => {
    editExerciseForm.validateFields().then((vals) => {
      editExerciseMut.mutate({
        name: vals.name,
        exerciseTemplate: vals.exerciseTemplate,
        startDate: vals.dates[0].format('YYYY-MM-DD'),
        endDate: vals.dates[1].format('YYYY-MM-DD'),
        defaultDutyDays: vals.defaultDutyDays,
      });
    });
  };

  const addUnitMut = useMutation({
    mutationFn: async ({ unitCode, template }: { unitCode: string; template: 'STANDARD' | 'A7' }) => {
      await pushUndoSnapshot('Add Unit');
      return api.addUnitBudget(exerciseId!, { unitCode, template });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      setAddUnitOpen(false);
      unitForm.resetFields();
      message.success('Unit added');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to add unit');
    },
  });

  const handleAddUnit = () => {
    unitForm.validateFields().then((values) => {
      addUnitMut.mutate({
        unitCode: values.unitCode,
        template: values.template,
      });
    });
  };

  const removeUnitMut = useMutation({
    mutationFn: async ({ unitCode }: { unitCode: string }) => {
      await pushUndoSnapshot('Remove Unit');
      return api.deleteUnitBudget(exerciseId!, unitCode);
    },
    onSuccess: (_exercise, vars) => {
      const normalized = vars.unitCode.trim().toUpperCase();
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });

      if (location.pathname === `/units/${normalized}`) {
        navigate('/');
      }

      setRemoveUnitOpen(false);
      removeUnitForm.resetFields();
      message.success('Unit removed');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to remove unit');
    },
  });

  const handleRemoveUnit = () => {
    removeUnitForm.validateFields().then((values) => {
      removeUnitMut.mutate({ unitCode: values.unitCode });
    });
  };

  const editBudgetMut = useMutation({
    mutationFn: async ({ rpaBudgetTarget, omBudgetTarget }: { rpaBudgetTarget: number; omBudgetTarget: number }) => {
      await pushUndoSnapshot('Edit Budget');
      const nextRpaBudgetTarget = Number(rpaBudgetTarget || 0);
      const nextOmBudgetTarget = Number(omBudgetTarget || 0);
      const totalBudget = nextRpaBudgetTarget + nextOmBudgetTarget;

      await api.updateAppConfig({
        ...appConfig,
        BUDGET_TARGET_RPA: String(nextRpaBudgetTarget),
        BUDGET_TARGET_OM: String(nextOmBudgetTarget),
      });
      await api.updateExercise(exerciseId!, { totalBudget });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['appConfig'] });
      setEditBudgetOpen(false);
      message.success('Exercise budget updated');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to update exercise budget');
    },
  });

  const undoMut = useMutation({
    mutationFn: ({ targetExerciseId, snapshot }: { targetExerciseId: string; snapshot: ExerciseUndoSnapshot }) =>
      api.restoreExerciseSnapshot(targetExerciseId, snapshot),
    onSuccess: (restoredExercise, vars) => {
      queryClient.setQueryData(['exercise', vars.targetExerciseId], restoredExercise);
      queryClient.invalidateQueries({ queryKey: ['exercise', vars.targetExerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', vars.targetExerciseId] });
      queryClient.invalidateQueries({ queryKey: ['appConfig'] });
      setUndoStacks((current) => ({
        ...current,
        [vars.targetExerciseId]: (current[vars.targetExerciseId] || []).slice(0, -1),
      }));
      message.success('Last change undone');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Unable to undo the last change');
    },
  });

  const handleEditBudget = () => {
    editBudgetForm.validateFields().then((values) => {
      editBudgetMut.mutate({
        rpaBudgetTarget: values.rpaBudgetTarget,
        omBudgetTarget: values.omBudgetTarget,
      });
    });
  };

  const copyExerciseMut = useMutation({
    mutationFn: (id: string) => api.copyExercise(id),
    onSuccess: (copiedExercise) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.setQueryData(['exercise', copiedExercise.id], copiedExercise);
      setUndoStacks((current) => ({
        ...current,
        [copiedExercise.id]: [],
      }));
      setExerciseId(copiedExercise.id);
      message.success(`Copied exercise as ${copiedExercise.name}`);
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to copy exercise');
    },
  });

  const handleUndo = () => {
    if (!exerciseId || !currentUndoEntry) return;
    undoMut.mutate({
      targetExerciseId: exerciseId,
      snapshot: currentUndoEntry.snapshot,
    });
  };

  // Delete current exercise
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteExercise(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['exercises'] });

      const previousExercises = queryClient.getQueryData<Exercise[]>(['exercises']) || [];
      const nextExercises = previousExercises.filter((exercise) => exercise.id !== id);
      queryClient.setQueryData(['exercises'], nextExercises);

      if (exerciseId === id) {
        setExerciseId(nextExercises[0]?.id ?? null);
      }

      queryClient.removeQueries({ queryKey: ['exercise', id] });
      queryClient.removeQueries({ queryKey: ['budget', id] });

      return { previousExercises, previousExerciseId: exerciseId };
    },
    onError: (_error, _id, context) => {
      if (!context) return;
      queryClient.setQueryData(['exercises'], context.previousExercises);
      setExerciseId(context.previousExerciseId);
      message.error('Failed to delete exercise');
    },
    onSuccess: (_data, id) => {
      setUndoStacks((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      message.success('Exercise deleted');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const confirmDeleteExercise = (targetId: string) => {
    const targetExercise = exercises.find((item) => item.id === targetId);
    if (!targetExercise) return;

    Modal.confirm({
      title: `Delete "${targetExercise.name}"?`,
      content: 'This will permanently remove all data for this exercise. This action cannot be undone.',
      okText: 'Delete Exercise',
      cancelText: 'Keep Exercise',
      okButtonProps: { danger: true },
      onOk: () => deleteMut.mutate(targetId),
    });
  };

  // JSON export all data
  const handleBackup = async () => {
    const json = await api.exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PATRIOT_MEDIC_Backup_${dayjs().format('YYYY-MM-DD')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Backup downloaded');
  };

  // JSON import all data
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleRestore = () => fileInputRef.current?.click();
  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = await file.text();
      await api.importAllData(json);
      queryClient.invalidateQueries();
      setUndoStacks({});
      setExerciseId(null);
      localStorage.removeItem('exerciseId');
      message.success('Data restored from backup');
    } catch {
      message.error('Invalid backup file');
    }
    e.target.value = '';
  };

  const fmt = (n: number | undefined) => '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const hasAnyExercise = exercises.length > 0;
  const exerciseOptions = exercises.map((item) => ({
    value: item.id,
    label: item.name,
    exerciseName: item.name,
  }));

  const unitChildren = (exercise?.unitBudgets || [])
    .map((unit) => unit.unitCode)
    .sort(compareUnitCodes)
    .map((unitCode) => ({ key: `/units/${unitCode}`, label: getUnitDisplayLabel(unitCode) }));

  const baseMenuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    {
      key: 'units',
      icon: <TeamOutlined />,
      label: 'Units',
      children: unitChildren,
    },
    { key: '/rates', icon: <SettingOutlined />, label: 'Rate Config' },
    {
      key: 'reports',
      icon: <FileExcelOutlined />,
      label: 'Reports',
      children: [
        { key: '/reports/pm-27-cost-projections', label: 'PM 27 Cost Projections' },
        { key: '/reports/sustainment', label: 'Exercise Sustainment' },
        { key: '/reports/balance', label: 'Balance' },
        { key: '/reports/comparison', label: 'Comparison' },
      ],
    },
    { key: '/reports/refinements', icon: <EditOutlined />, label: 'Refinements' },
  ];

  const menuItems = baseMenuItems.map((item) => ({
    ...item,
    disabled: !hasAnyExercise,
    children: item.children?.map((child) => ({ ...child, disabled: !hasAnyExercise })),
  }));

  const selectedKey = location.pathname;

  const handleLogout = async () => {
    await api.logoutAccount();
    queryClient.clear();
    setUndoStacks({});
    setExerciseId(null);
    navigate('/auth');
    message.success('Signed out');
  };

  useEffect(() => {
    if (!editExerciseOpen || !exercise) return;
    editExerciseForm.setFieldsValue({
      name: exercise.name,
      exerciseTemplate: normalizeExerciseTemplate(exercise.exerciseTemplate),
      dates: [dayjs(exercise.startDate), dayjs(exercise.endDate)],
      defaultDutyDays: exercise.defaultDutyDays,
    });
  }, [editExerciseOpen, exercise, editExerciseForm]);

  useEffect(() => {
    if (!editBudgetOpen) return;
    editBudgetForm.setFieldsValue({
      rpaBudgetTarget: Number(appConfig.BUDGET_TARGET_RPA || 0),
      omBudgetTarget: Number(appConfig.BUDGET_TARGET_OM || 0),
    });
  }, [editBudgetOpen, appConfig.BUDGET_TARGET_RPA, appConfig.BUDGET_TARGET_OM, editBudgetForm]);

  const editBudgetTotal =
    Number(editBudgetDraft?.rpaBudgetTarget ?? Number(appConfig.BUDGET_TARGET_RPA || 0)) +
    Number(editBudgetDraft?.omBudgetTarget ?? Number(appConfig.BUDGET_TARGET_OM || 0));

  return (
    <AppContext.Provider value={{ exercise, budget, exerciseId, setExerciseId, refetchBudget, refetchExercise, pushUndoSnapshot }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider width={240} className="ct-sider" breakpoint="lg" collapsedWidth={60}>
          {/* Logo */}
          <div className="ct-logo">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ThunderboltOutlined style={{ fontSize: 22, color: '#4096ff' }} />
              <Typography.Title level={4} className="ct-logo-title">
                PATRIOT MEDIC
              </Typography.Title>
            </div>
            <span className="ct-logo-sub">Budget Management</span>
          </div>
          <div className="ct-logo-divider" />
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={['units', 'reports']}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Layout>
          <Header className="ct-header">
            <div className="ct-header-left">
            <Select
              style={{ width: 260 }}
              placeholder="Select exercise"
              value={exerciseId}
                onChange={setExerciseId}
                options={exerciseOptions}
                optionRender={(option) => {
                  const targetId = String(option.data.value);
                  const targetName = String(option.data.exerciseName ?? option.data.label ?? option.label ?? targetId);

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {targetName}
                      </span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`Delete ${targetName}`}
                        loading={deleteMut.isPending && deleteMut.variables === targetId}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmDeleteExercise(targetId);
                        }}
                      />
                    </div>
                  );
                }}
                suffixIcon={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
              />
              {exerciseId && (
                <Tooltip title="Copy current exercise">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyExerciseMut.mutate(exerciseId)}
                    loading={copyExerciseMut.isPending}
                    aria-label="Copy current exercise"
                  />
                </Tooltip>
              )}
              <Tooltip title={hasAnyExercise ? 'Create new exercise' : 'Start here to create your exercise'}>
                <Button
                  icon={<PlusOutlined />}
                  type="primary"
                  className={!hasAnyExercise ? 'ct-cta-create' : undefined}
                  onClick={() => setCreateOpen(true)}
                >
                  {hasAnyExercise ? 'New Exercise' : 'Start here to create your exercise'}
                </Button>
              </Tooltip>
              {exerciseId && exercise && (
                <Tooltip title="Edit exercise name, dates, duty days, and total budget">
                  <Button icon={<EditOutlined />} onClick={() => setEditExerciseOpen(true)}>
                    Edit Exercise
                  </Button>
                </Tooltip>
              )}
              {exerciseId && (
                <Tooltip title="Edit overall exercise budget">
                  <Button icon={<EditOutlined />} onClick={() => setEditBudgetOpen(true)}>
                    Edit Budget
                  </Button>
                </Tooltip>
              )}
              {exerciseId && (
                <Tooltip title="Add a new unit to this exercise">
                  <Button icon={<TeamOutlined />} onClick={() => setAddUnitOpen(true)}>
                    Add Unit
                  </Button>
                </Tooltip>
              )}
              {exerciseId && unitChildren.length > 0 && (
                <Tooltip title="Remove a unit from this exercise">
                  <Button danger onClick={() => setRemoveUnitOpen(true)}>
                    Remove Unit
                  </Button>
                </Tooltip>
              )}
              {exerciseId && (
                <Tooltip title={currentUndoEntry ? `Undo last saved change: ${currentUndoEntry.label}` : `Undo last saved exercise change (${MAX_UNDO_STEPS} saved steps max)`}>
                  <Button
                    icon={<RollbackOutlined />}
                    onClick={handleUndo}
                    disabled={!currentUndoEntry}
                    loading={undoMut.isPending}
                  >
                    Undo{currentUndoStack.length > 0 ? ` (${currentUndoStack.length})` : ''}
                  </Button>
                </Tooltip>
              )}
              {!hasAnyExercise && (
                <Typography.Text className="ct-cta-hint">
                  <ArrowRightOutlined /> Create your first exercise to unlock all tabs
                </Typography.Text>
              )}
              {exerciseId && (
                <Tooltip title="Delete current exercise">
                  <Button
                    icon={<DeleteOutlined />}
                    danger
                    onClick={() => confirmDeleteExercise(exerciseId)}
                  />
                </Tooltip>
              )}
              <Dropdown
                menu={{
                  items: [
                    { key: 'backup', icon: <CloudDownloadOutlined />, label: 'Backup All Data', onClick: handleBackup },
                    { key: 'restore', icon: <CloudUploadOutlined />, label: 'Restore from Backup', onClick: handleRestore },
                  ],
                }}
              >
                <Button icon={<DatabaseOutlined />}>Data <DownOutlined /></Button>
              </Dropdown>
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                {currentUser?.username || currentUser?.name}
              </Typography.Text>
              <Tooltip title="Sign out">
                <Button icon={<LogoutOutlined />} onClick={handleLogout}>
                  Logout
                </Button>
              </Tooltip>
              <input type="file" ref={fileInputRef} accept=".json" style={{ display: 'none' }} onChange={onFileSelected} />
            </div>
            {budget && (
              <div className="ct-header-stats">
                <div className="ct-header-stat">
                  <div className="ct-header-stat-label">Grand Total</div>
                  <div className="ct-header-stat-value" style={{ color: '#1a1a2e' }}>{fmt(budget.grandTotal)}</div>
                </div>
                <div style={{ width: 1, height: 32, background: '#e8ecf1' }} />
                <div className="ct-header-stat">
                  <div className="ct-header-stat-label">RPA</div>
                  <div className="ct-header-stat-value" style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</div>
                </div>
                <div className="ct-header-stat">
                  <div className="ct-header-stat-label">O&M</div>
                  <div className="ct-header-stat-value" style={{ color: '#52c41a' }}>{fmt(budget.totalOm)}</div>
                </div>
                <div className="ct-header-stat">
                  <div className="ct-header-stat-label">PAX</div>
                  <div className="ct-header-stat-value">{displayTotalPax}</div>
                </div>
              </div>
            )}
          </Header>
          <Content className="ct-content">
            {exerciseId ? (
              <div className="ct-page-enter" key={location.pathname}>
                <Outlet />
              </div>
            ) : (
              <EmptyState onOpen={() => setCreateOpen(true)} />
            )}
          </Content>
        </Layout>
      </Layout>

      {/* Create Exercise modal */}
      <Modal
        title="Create New Exercise"
        open={createOpen}
        onOk={handleCreate}
        confirmLoading={createMut.isPending}
        onCancel={() => setCreateOpen(false)}
        okText="Create Exercise"
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            defaultDutyDays: 14,
            exerciseTemplate: DEFAULT_EXERCISE_TEMPLATE,
          }}
        >
          <Form.Item name="name" label="Exercise Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., China Focus FY26 Spring" size="large" />
          </Form.Item>
          <Form.Item name="exerciseTemplate" label="Select Template" rules={[{ required: true }]}>
            <Select
              options={EXERCISE_TEMPLATE_OPTIONS}
              placeholder="Choose a template"
              size="large"
            />
          </Form.Item>
          <Form.Item name="dates" label="Start / End Date" rules={[{ required: true }]}>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              size="large"
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  const days = dates[1].diff(dates[0], 'day') + 1;
                  form.setFieldsValue({ defaultDutyDays: days });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="defaultDutyDays" label="Default Duty Days">
            <InputNumber min={1} max={365} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Quarterly planning uses the standard fiscal schedule automatically:
            {' '}Q1 Oct-Dec, Q2 Jan-Mar, Q3 Apr-Jun, Q4 Jul-Sep.
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="Edit Exercise"
        open={editExerciseOpen}
        onOk={handleEditExercise}
        confirmLoading={editExerciseMut.isPending}
        onCancel={() => setEditExerciseOpen(false)}
        okText="Save Exercise"
        width={640}
      >
        <Form form={editExerciseForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Exercise Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., China Focus FY26 Spring" size="large" />
          </Form.Item>
          <Form.Item name="exerciseTemplate" label="Select Template" rules={[{ required: true }]}>
            <Select
              options={EXERCISE_TEMPLATE_OPTIONS}
              placeholder="Choose a template"
              size="large"
            />
          </Form.Item>
          <Form.Item name="dates" label="Start / End Date" rules={[{ required: true }]}>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              size="large"
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  const days = dates[1].diff(dates[0], 'day') + 1;
                  editExerciseForm.setFieldsValue({ defaultDutyDays: days });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="defaultDutyDays" label="Default Duty Days" rules={[{ required: true }]}>
            <InputNumber min={1} max={365} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Quarterly planning uses the standard fiscal schedule automatically:
            {' '}Q1 Oct-Dec, Q2 Jan-Mar, Q3 Apr-Jun, Q4 Jul-Sep.
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="Add Unit"
        open={addUnitOpen}
        onOk={handleAddUnit}
        confirmLoading={addUnitMut.isPending}
        onCancel={() => setAddUnitOpen(false)}
        okText="Add Unit"
      >
        <Form form={unitForm} layout="vertical" initialValues={{ template: 'STANDARD' }}>
          <Form.Item
            name="unitCode"
            label="Unit Code"
            rules={[
              { required: true, message: 'Enter a unit code' },
              { pattern: /^[A-Za-z0-9_-]{2,16}$/, message: 'Use 2-16 characters: letters, numbers, _ or -' },
            ]}
          >
            <Input placeholder="e.g., MED, J7, OPS-1" onChange={(e) => unitForm.setFieldValue('unitCode', e.target.value.toUpperCase())} />
          </Form.Item>
          <Form.Item name="template" label="Personnel Template" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'STANDARD', label: 'Standard (Player + White Cell)' },
                { value: 'A7', label: 'Planning/Support (A7-style)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Remove Unit"
        open={removeUnitOpen}
        onOk={handleRemoveUnit}
        confirmLoading={removeUnitMut.isPending}
        onCancel={() => setRemoveUnitOpen(false)}
        okButtonProps={{ danger: true }}
        okText="Remove Unit"
      >
        <Form form={removeUnitForm} layout="vertical">
          <Form.Item
            name="unitCode"
            label="Select Unit"
            rules={[{ required: true, message: 'Select a unit to remove' }]}
          >
            <Select
              placeholder="Choose unit"
              options={unitChildren.map((unit) => ({ value: unit.label, label: unit.label }))}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            This removes the selected unit and all of its personnel and execution cost data.
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="Edit Overall Exercise Budget"
        open={editBudgetOpen}
        onOk={handleEditBudget}
        confirmLoading={editBudgetMut.isPending}
        onCancel={() => setEditBudgetOpen(false)}
        okText="Save Budget"
      >
        <Form form={editBudgetForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="rpaBudgetTarget"
            label="RPA Budget ($)"
            rules={[{ required: true, message: 'Enter the RPA budget' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item
            name="omBudgetTarget"
            label="O&M Budget ($)"
            rules={[{ required: true, message: 'Enter the O&M budget' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item label="Overall Exercise Budget ($)">
            <InputNumber min={0} style={{ width: '100%' }} size="large" value={editBudgetTotal} readOnly />
          </Form.Item>
          <Typography.Text type="secondary">
            The overall exercise budget is automatically set to RPA + O&amp;M.
          </Typography.Text>
        </Form>
      </Modal>
    </AppContext.Provider>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="ct-empty-state">
      <div className="ct-empty-icon">
        <ThunderboltOutlined />
      </div>
      <Typography.Title level={3} className="ct-empty-title">
        No Exercise Selected
      </Typography.Title>
      <Typography.Paragraph className="ct-empty-desc">
        Start by creating your first exercise. Once created, all unit, rate, O&M, and report tabs become available.
      </Typography.Paragraph>
      <Button type="primary" icon={<PlusOutlined />} onClick={onOpen} size="large"
        className="ct-cta-create"
        style={{ height: 48, paddingInline: 32, fontSize: 16 }}>
        Start here to create your exercise
      </Button>
    </div>
  );
}
