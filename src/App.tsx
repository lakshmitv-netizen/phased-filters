import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IndustryProvider } from './contexts/IndustryContext';
import { PlanWorkflowProvider } from './contexts/PlanWorkflowContext';
import { UserProvider } from './contexts/UserContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { PlanningGridSessionProvider } from './contexts/PlanningGridSessionContext';
import { AgentforceProvider } from './contexts/AgentforceContext';
import Header from './components/Header';
import ForecastingGrid from './components/ForecastingGrid';
import PlanningForecastingPage from './pages/PlanningForecastingPage';
import PlanningForecastingListPage from './pages/PlanningForecastingListPage';
import SetupSalesforceGoPage from './pages/SetupSalesforceGoPage';
import CpmFeatureSetPage from './pages/CpmFeatureSetPage';
import CpmFeaturePage from './pages/CpmFeaturePage';
import DpeDefinitionPage from './pages/DpeDefinitionPage';
import PlanConfigurationListPage from './pages/PlanConfigurationListPage';
import PlanConfigCreatorPage from './pages/PlanConfigCreatorPage';
import DimensionsAndHierarchiesPage from './pages/DimensionsAndHierarchiesPage';
import PresentationPage from './pages/PresentationPage';
import IndustryUrlSync from './components/IndustryUrlSync';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/App.css';

// Grid wrapper component for consistent layout
const GridPage: React.FC = () => (
  <div className="app">
    <Header />
    <div className="main-content">
      <ErrorBoundary>
        <ForecastingGrid />
      </ErrorBoundary>
    </div>
  </div>
);

// Embed builds (e.g. inside the IPF_Shell iframe) set VITE_ROUTER=hash so routing works
// from a static subfolder without server rewrites; VITE_HOME_ROUTE picks the landing view.
const useHashRouter = import.meta.env.VITE_ROUTER === 'hash';
const Router = useHashRouter ? HashRouter : BrowserRouter;
const routerProps = useHashRouter ? {} : { basename: import.meta.env.BASE_URL };
const homeRoute = (import.meta.env.VITE_HOME_ROUTE as string) || '/home/manufacturing-deep';

function App() {
  console.log('App component rendering');
  return (
    <UserProvider>
      <NotificationsProvider>
      <IndustryProvider>
        <PlanningGridSessionProvider>
        <PlanWorkflowProvider>
        <AgentforceProvider>
        <Router {...routerProps}>
          <IndustryUrlSync />
          <Routes>
            <Route path="/home" element={<Navigate to={homeRoute} replace />} />
            <Route path="/home/manufacturing" element={<GridPage />} />
            <Route path="/home/consumergoods" element={<GridPage />} />
            <Route path="/home/grid-264" element={<GridPage />} />
            <Route path="/home/manufacturing-deep" element={<GridPage />} />
            <Route path="/home/manufacturing-acme" element={<GridPage />} />
            <Route path="/planning-forecasting-list" element={<PlanningForecastingListPage />} />
            <Route path="/planning-forecasting" element={<PlanningForecastingPage />} />
            <Route path="/setup/salesforce-go" element={<SetupSalesforceGoPage />} />
            <Route path="/setup/cpm-feature-set" element={<CpmFeatureSetPage />} />
            <Route path="/setup/cpm-feature-page" element={<CpmFeaturePage />} />
            <Route path="/setup/dpe-definition" element={<DpeDefinitionPage />} />
            <Route path="/setup/plan-configuration-list" element={<PlanConfigurationListPage />} />
            <Route path="/setup/plan-config-creator" element={<PlanConfigCreatorPage />} />
            <Route path="/setup/dimensions-and-hierarchies" element={<DimensionsAndHierarchiesPage />} />
            <Route path="/grid" element={<GridPage />} />
            <Route path="/presentation" element={<PresentationPage />} />
            {/* Land straight on the grid (skip the presentation shell). The
                presentation view is still reachable at /presentation. */}
            <Route path="/" element={<Navigate to={homeRoute} replace />} />
          </Routes>
        </Router>
        </AgentforceProvider>
        </PlanWorkflowProvider>
        </PlanningGridSessionProvider>
      </IndustryProvider>
      </NotificationsProvider>
    </UserProvider>
  );
}

export default App;

