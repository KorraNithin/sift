import { BarChart3, FileSearch, LogOut } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useAuth } from '../auth.jsx';
import { Logo } from './ui.jsx';

function UserChip({ compact = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  return (
    <div className={`user-chip ${compact ? 'compact' : ''}`}>
      <span className="avatar" aria-hidden="true">
        {user.name
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')}
      </span>
      <span className="who">
        <b>{user.name}</b>
        <small>{ROLE_LABEL[user.role]}</small>
      </span>
      <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
        <LogOut size={17} />
      </button>
    </div>
  );
}

/** Recruiter and delivery-head layout: a quiet left rail on desktop, a slim top bar on phones. */
export function StaffShell() {
  const { user } = useAuth();
  return (
    <div className="app">
      <aside className="rail">
        <Link to="/" className="brand">
          <Logo />
          <span>Sift</span>
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <FileSearch size={18} />
            <span>Requisitions</span>
          </NavLink>
          {user.role === 'head' && (
            <NavLink to="/insights" className={({ isActive }) => (isActive ? 'active' : '')}>
              <BarChart3 size={18} />
              <span>Insights and audit</span>
            </NavLink>
          )}
        </nav>
        <UserChip />
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

/** Client hiring-manager layout: a single clean column that works well on a phone. */
export function PortalShell() {
  return (
    <div className="portal">
      <header className="portal-bar">
        <Link to="/portal" className="brand">
          <Logo size={26} />
          <span>Sift</span>
          <em>for hiring managers</em>
        </Link>
        <UserChip compact />
      </header>
      <main className="portal-main">
        <Outlet />
      </main>
    </div>
  );
}
