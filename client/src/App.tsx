import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import UnitView from './pages/UnitView';
import RateConfig from './pages/RateConfig';
import OmCostCenter from './pages/OmCostCenter';
import Reports from './pages/Reports';

export default function App() {
  return (
    <Routes>
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
