import { useState, useEffect, useRef, createContext, useContext } from 'react';
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
  DollarOutlined,
  FileExcelOutlined,
  PlusOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DownOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ArrowRightOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as api from '../services/api';
import type { Exercise, ExerciseDetail, BudgetResult } from '../types';
import { clearAuthSession, getStoredUser } from '../services/auth';

const { Header, Sider, Content } = Layout;

interface AppCtx {
  exercise: ExerciseDetail | null;
  budget: BudgetResult | null;
  exerciseId: string | null;
  setExerciseId: (id: string | null) => void;
  refetchBudget: () => void;
  refetchExercise: () => void;
}
export const AppContext = createContext<AppCtx>({
  exercise: null,
  budget: null,
  exerciseId: null,
  setExerciseId: () => {},
  refetchBudget: () => {},
  refetchExercise: () => {},
});
export const useApp = () => useContext(AppContext);

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const apiErrorNotifiedRef = useRef(false);
  const [exerciseId, setExerciseId] = useState<string | null>(localStorage.getItem('exerciseId'));
  const [createOpen, setCreateOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [removeUnitOpen, setRemoveUnitOpen] = useState(false);
  const [form] = Form.useForm();
  const [unitForm] = Form.useForm();
  const [removeUnitForm] = Form.useForm();

  // Fetch exercise list
  const {
    data: exercises = [],
    isFetched: exercisesFetched,
    isError: exercisesLoadError,
  } = useQuery({ queryKey: ['exercises'], queryFn: api.getExercises });

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
        totalBudget: vals.totalBudget,
        startDate: vals.dates[0].format('YYYY-MM-DD'),
        endDate: vals.dates[1].format('YYYY-MM-DD'),
        defaultDutyDays: vals.defaultDutyDays,
      });
    });
  };

  const addUnitMut = useMutation({
    mutationFn: ({ unitCode, template }: { unitCode: string; template: 'STANDARD' | 'A7' }) =>
      api.addUnitBudget(exerciseId!, { unitCode, template }),
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
    mutationFn: ({ unitCode }: { unitCode: string }) => api.deleteUnitBudget(exerciseId!, unitCode),
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
    onSuccess: () => {
      message.success('Exercise deleted');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  // JSON export all data
  const handleBackup = async () => {
    const json = await api.exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ChinaTracker_Backup_${dayjs().format('YYYY-MM-DD')}.json`;
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

  const unitChildren = (exercise?.unitBudgets || [])
    .map((unit) => unit.unitCode)
    .sort((a, b) => a.localeCompare(b))
    .map((unitCode) => ({ key: `/units/${unitCode}`, label: unitCode }));

  const baseMenuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    {
      key: 'units',
      icon: <TeamOutlined />,
      label: 'Units',
      children: unitChildren,
    },
    { key: '/rates', icon: <SettingOutlined />, label: 'Rate Config' },
    { key: '/om-costs', icon: <DollarOutlined />, label: 'O&M Costs' },
    { key: '/reports', icon: <FileExcelOutlined />, label: 'Reports' },
  ];

  const menuItems = baseMenuItems.map((item) => ({
    ...item,
    disabled: !hasAnyExercise,
    children: item.children?.map((child) => ({ ...child, disabled: !hasAnyExercise })),
  }));

  const selectedKey = location.pathname;

  const handleLogout = () => {
    clearAuthSession();
    queryClient.clear();
    setExerciseId(null);
    navigate('/auth');
    message.success('Signed out');
  };

  return (
    <AppContext.Provider value={{ exercise, budget, exerciseId, setExerciseId, refetchBudget, refetchExercise }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider width={240} className="ct-sider" breakpoint="lg" collapsedWidth={60}>
          {/* Logo */}
          <div className="ct-logo">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ThunderboltOutlined style={{ fontSize: 22, color: '#4096ff' }} />
              <Typography.Title level={4} className="ct-logo-title">
                China Tracker
              </Typography.Title>
            </div>
            <span className="ct-logo-sub">Budget Management</span>
          </div>
          <div className="ct-logo-divider" />
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={['units']}
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
                options={exercises.map((e) => ({ value: e.id, label: e.name }))}
                suffixIcon={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
              />
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
                    onClick={() => Modal.confirm({
                      title: 'Delete this exercise?',
                      content: 'This will permanently remove all data for this exercise.',
                      okButtonProps: { danger: true },
                      onOk: () => deleteMut.mutate(exerciseId),
                    })}
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
                  <div className="ct-header-stat-value">{budget.totalPax}</div>
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
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Exercise Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., China Focus FY26 Spring" size="large" />
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
          <Form.Item name="defaultDutyDays" label="Default Duty Days" initialValue={14}>
            <InputNumber min={1} max={365} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item
            name="totalBudget"
            label="Total Exercise Budget ($)"
            initialValue={5000000}
            rules={[{ required: true, message: 'Enter total exercise budget' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
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
