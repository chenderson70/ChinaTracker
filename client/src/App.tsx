import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import UnitView from './pages/UnitView';
import RateConfig from './pages/RateConfig';
import OmCostCenter from './pages/OmCostCenter';
import Reports from './pages/Reports';
import AuthPage from './pages/AuthPage';
import * as api from './services/api';
import { clearAuthSession, getAuthChangedEventName, getAuthToken } from './services/auth';
import { useEffect, useState } from 'react';

export default function App() {
  const [authVersion, setAuthVersion] = useState(0);
  const token = getAuthToken();

  useEffect(() => {
    const eventName = getAuthChangedEventName();
    const onAuthChanged = () => setAuthVersion((current) => current + 1);
    window.addEventListener(eventName, onAuthChanged);
    return () => window.removeEventListener(eventName, onAuthChanged);
  }, []);

  const meQuery = useQuery({
    queryKey: ['authMe', authVersion],
    queryFn: api.getCurrentUser,
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (!token || !meQuery.isError) return;
    clearAuthSession();
  }, [token, meQuery.isError]);

  if (token && meQuery.isLoading) {
    return (
      <div className="ct-loading">
        <Spin size="large" />
      </div>
    );
  }

  const authenticated = !!token && !!meQuery.data;

  if (!authenticated) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/units/:unitCode" element={<UnitView />} />
        <Route path="/rates" element={<RateConfig />} />
        <Route path="/om-costs" element={<OmCostCenter />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
