import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import { APP_NAV_LINKS } from './appNav.js';
import { ShowtimesDataProvider } from './hooks/useShowtimesData.js';
import { PipelineReportProvider } from './hooks/usePipelineReport.js';
import DoubleFeatureRedirect from './pages/DoubleFeatureRedirect.jsx';
import MarathonRedirect from './pages/MarathonRedirect.jsx';
import PlannerPage from './pages/PlannerPage.jsx';
import RecentlyAddedPage from './pages/RecentlyAddedPage.jsx';
import ShowtimesPage from './pages/ShowtimesPage.jsx';
import { MARATHON_ROUTE, RECENTLY_ADDED_ROUTE } from './utils/routes.js';

function useAppShellOffset() {
  const location = useLocation();

  useEffect(() => {
    const shell = document.querySelector('.app-shell-header');
    if (!shell) return undefined;

    function updateShellOffset() {
      document.documentElement.style.setProperty(
        '--app-shell-offset',
        `${shell.offsetHeight}px`,
      );
    }

    updateShellOffset();
    window.addEventListener('resize', updateShellOffset);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateShellOffset);
      resizeObserver.observe(shell);
    }

    return () => {
      window.removeEventListener('resize', updateShellOffset);
      resizeObserver?.disconnect();
    };
  }, [location.pathname]);
}

function AppShell() {
  useAppShellOffset();

  return (
    <div className="app-container">
      <header className="app-shell-header">
        <div className="app-shell-brand">
          <NavLink to="/" className="app-wordmark" end>
            Reel Seattle
          </NavLink>
          <p className="app-tagline">Seattle movie showtimes &amp; planning</p>
        </div>
        <nav className="main-nav" aria-label="Main">
          {APP_NAV_LINKS.map(({ to, label, end, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-button${primary ? ' nav-button--primary' : ''}${isActive ? ' active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ShowtimesPage />} />
          <Route path={RECENTLY_ADDED_ROUTE} element={<RecentlyAddedPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/double-feature" element={<DoubleFeatureRedirect />} />
          <Route path={MARATHON_ROUTE} element={<MarathonRedirect />} />
          <Route path={`${MARATHON_ROUTE}/`} element={<MarathonRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ShowtimesDataProvider>
      <PipelineReportProvider>
        <AppShell />
      </PipelineReportProvider>
    </ShowtimesDataProvider>
  );
}
