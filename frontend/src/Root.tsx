import { lazy, Suspense, useCallback, type ComponentType } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import { PageLoading } from './shared/ui/PageLoading';
import { isArchiveKind, modulePath, type ArchiveKind } from './app/modules';

// Each module is its own chunk, fetched the first time its route is visited.
const HomePage = lazy(() => import('./HomePage'));
const StocksModule = lazy(() => import('./App'));
const ResearchModule = lazy(() => import('./ResearchModule'));
const CalendarModule = lazy(() => import('./CalendarModule'));
const EarningsCalendarModule = lazy(() => import('./EarningsCalendarModule'));
const TechCycleModule = lazy(() => import('./TechCycleModule'));
const IdeaModule = lazy(() => import('./IdeaModule'));
const TradeModule = lazy(() => import('./TradeModule'));
const ValuationModule = lazy(() => import('./features/valuation/ValuationModule'));
const ArchiveModule = lazy(() => import('./ArchiveModule'));

function useNavigateTo(path: string) {
  const navigate = useNavigate();
  return useCallback(() => navigate(path), [navigate, path]);
}

function HomeRoute() {
  const navigate = useNavigate();
  return <HomePage onSelectModule={id => navigate(modulePath(id))} />;
}

function ModuleRoute({ component: Module }: { component: ComponentType<{ onGoHome: () => void }> }) {
  const goHome = useNavigateTo('/');
  return <Module onGoHome={goHome} />;
}

function ArchiveRoute() {
  const { kind } = useParams();
  const navigate = useNavigate();
  const goHome = useNavigateTo('/');
  const backToArchive = useNavigateTo('/archive');

  if (kind === undefined) {
    return <ArchiveModule onGoHome={goHome} onSelect={(k: ArchiveKind) => navigate(`/archive/${k}`)} />;
  }
  if (!isArchiveKind(kind)) return <Navigate to="/archive" replace />;
  if (kind === 'stocks') return <StocksModule onGoHome={backToArchive} forceArchived />;
  if (kind === 'reports') return <ResearchModule onGoHome={backToArchive} forceArchived />;
  return <IdeaModule onGoHome={backToArchive} forceArchived />;
}

export default function Root() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/stocks" element={<ModuleRoute component={StocksModule} />} />
        <Route path="/research" element={<ModuleRoute component={ResearchModule} />} />
        <Route path="/calendar" element={<ModuleRoute component={CalendarModule} />} />
        <Route path="/earnings-calendar" element={<ModuleRoute component={EarningsCalendarModule} />} />
        <Route path="/techcycle" element={<ModuleRoute component={TechCycleModule} />} />
        <Route path="/ideas" element={<ModuleRoute component={IdeaModule} />} />
        <Route path="/trades" element={<ModuleRoute component={TradeModule} />} />
        <Route path="/valuation" element={<ModuleRoute component={ValuationModule} />} />
        <Route path="/archive" element={<ArchiveRoute />} />
        <Route path="/archive/:kind" element={<ArchiveRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
