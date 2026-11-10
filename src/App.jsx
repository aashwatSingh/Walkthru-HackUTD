import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider.jsx';
import RequireRole from './auth/RequireRole.jsx';
import LoginPage from './auth/LoginPage.jsx';
import InspectPage, { MyUnit } from './student/InspectPage.jsx';
import ReportPage from './report/ReportPage.jsx';
import { Spinner, usePointerLight } from './components/ui.jsx';
import { homeFor } from './lib/rules.js';
import Landing from './landing/Landing.jsx';

// Admin screens (charts, QR codes, the Nemotron panel) load only when an admin opens them,
// so students' phones don't download that code.
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.jsx'));
const QrGenerator = lazy(() => import('./admin/QrGenerator.jsx'));

function Home() {
  const { profile, loading, mfaVerified } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  return <Navigate to={profile && mfaVerified ? homeFor(profile) : '/login'} replace />;
}

export default function App() {
  usePointerLight();
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/switching" element={<Spinner label="Switching user…" />} />
        {/* Students: the page a door QR code opens, plus a shortcut to their own room */}
        <Route path="/inspect/:unitCode" element={<RequireRole><InspectPage /></RequireRole>} />
        <Route path="/my-unit" element={<RequireRole role="student"><MyUnit /></RequireRole>} />
        {/* Housing admins only */}
        <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="/admin/qr" element={<RequireRole role="admin"><QrGenerator /></RequireRole>} />
        {/* Either role (a student only ever gets their own unit: RLS) */}
        <Route path="/report/:unitCode" element={<RequireRole><ReportPage /></RequireRole>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}
