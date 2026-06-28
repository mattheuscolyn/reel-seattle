import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import { ShowtimesDataProvider } from './hooks/useShowtimesData.js';
import { PipelineReportProvider } from './hooks/usePipelineReport.js';
import DoubleFeaturePage from './pages/DoubleFeaturePage.jsx';
import MarathonPage from './pages/MarathonPage.jsx';
import PlannerPage from './pages/PlannerPage.jsx';
import ShowtimesPage from './pages/ShowtimesPage.jsx';
import { isMarathonRoute, MARATHON_ROUTE } from './utils/routes.js';

function AppShell() {
  const location = useLocation();
  const marathonActive = isMarathonRoute(location.pathname);

  return (
    <div className={`app-container${marathonActive ? ' marathon-active' : ''}`}>
      <nav className="main-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}
        >
          Showtimes
        </NavLink>
        <NavLink
          to="/planner"
          className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}
        >
          Planner
        </NavLink>
        <NavLink
          to="/double-feature"
          className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}
        >
          Double Feature
        </NavLink>
        <NavLink
          to={MARATHON_ROUTE}
          className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}
        >
          Marathon
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<ShowtimesPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/double-feature" element={<DoubleFeaturePage />} />
        <Route path={MARATHON_ROUTE} element={<MarathonPage />} />
        <Route path={`${MARATHON_ROUTE}/`} element={<MarathonPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
