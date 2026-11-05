import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from './auth.jsx';
import { PortalShell, StaffShell } from './components/Shell.jsx';
import Insights from './pages/Insights.jsx';
import Login from './pages/Login.jsx';
import NewRequisition from './pages/NewRequisition.jsx';
import { PortalCandidate, PortalHome, PortalRequisition } from './pages/Portal.jsx';
import Requisition from './pages/Requisition.jsx';
import Requisitions from './pages/Requisitions.jsx';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash" aria-label="Loading" />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user)} replace /> : <Login />} />
      <Route
        element={
          <Protected roles={['recruiter', 'head']}>
            <StaffShell />
          </Protected>
        }
      >
        <Route index element={<Requisitions />} />
        <Route
          path="requisitions/new"
          element={
            <Protected roles={['recruiter']}>
              <NewRequisition />
            </Protected>
          }
        />
        <Route path="requisitions/:id" element={<Requisition />} />
        <Route
          path="insights"
          element={
            <Protected roles={['head']}>
              <Insights />
            </Protected>
          }
        />
      </Route>
      <Route
        path="portal"
        element={
          <Protected roles={['client']}>
            <PortalShell />
          </Protected>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="r/:id" element={<PortalRequisition />} />
        <Route path="c/:id" element={<PortalCandidate />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? homeFor(user) : '/login'} replace />} />
    </Routes>
  );
}
