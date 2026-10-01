import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ConfigProvider } from '@/lib/ConfigProvider';
import { useOnboarding } from '@/lib/config-context';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { useSyncLanguage } from '@/lib/i18n';
import SetupWizard from '@/pages/onboarding/SetupWizard';

import DashboardPage from '@/pages/DashboardPage';
import ActivitiesPage from '@/pages/ActivitiesPage';
import ActivityDetailPage from '@/pages/ActivityDetailPage';
import BestPage from '@/pages/BestPage';
import BikesPage from '@/pages/BikesPage';
import BikeComparePage from '@/pages/BikeComparePage';
import CalendarPage from '@/pages/CalendarPage';
import FormPage from '@/pages/FormPage';
import HeatmapPage from '@/pages/HeatmapPage';
import HrCurvePage from '@/pages/HrCurvePage';
import ImportPage from '@/pages/ImportPage';
import ProgressPage from '@/pages/ProgressPage';
import SegmentsPage from '@/pages/SegmentsPage';
import SegmentDetailPage from '@/pages/SegmentDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import RouteComparisonPage from '@/pages/RouteComparisonPage';
import TempCorrPage from '@/pages/TempCorrPage';
import WrappedPage from '@/pages/WrappedPage';
import CalculationsPage from '@/pages/CalculationsPage';
import CadencePage from '@/pages/CadencePage';
import CaloriesPage from '@/pages/CaloriesPage';
import SpeedTrendPage from '@/pages/SpeedTrendPage';
import WorkoutDetailPage from '@/pages/WorkoutDetailPage';
import WeekendPage from '@/pages/WeekendPage';
import FitnessPage from '@/pages/FitnessPage';
import ZoneDistributionPage from '@/pages/ZoneDistributionPage';

// Alte deutsche URLs (vor der Umbenennung) auf die neuen umleiten – inkl. :id und Query (?ref=),
// damit Lesezeichen und Links aus "Ähnliche vergleichen" weiter funktionieren
function RenamedRouteRedirect({ to }: { to: string }) {
  const { id } = useParams<{ id?: string }>();
  const { search } = useLocation();
  return <Navigate to={`${to}${id ? `/${id}` : ''}${search}`} replace />;
}

function AppRoutes() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="p-6 min-h-screen">
            {/* i18next-http-backend lädt den Namespace jeder Seite erst beim ersten Mount nach
                (siehe lib/i18n.ts) – ohne Suspense-Boundary würden Seiten mit synchronem
                t(key, {returnObjects:true}) (z.B. CalendarPage) kurz mit dem rohen Key statt
                einem Array rendern und crashen, bevor der Namespace geladen ist. */}
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/activities" element={<ActivitiesPage />} />
                <Route path="/activities/:id" element={<ActivityDetailPage />} />
                <Route path="/best" element={<BestPage />} />
                <Route path="/bikes" element={<BikesPage />} />
                <Route path="/bikes/compare" element={<BikeComparePage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/compare" element={<Navigate to="/progress?tab=vergleich" replace />} />
                <Route path="/form" element={<FormPage />} />
                <Route path="/heatmap" element={<HeatmapPage />} />
                <Route path="/hrcurve" element={<HrCurvePage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/segments" element={<SegmentsPage />} />
                <Route path="/segments/:id" element={<SegmentDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/routes" element={<Navigate to="/route-comparison" replace />} />
                <Route path="/speedhr" element={<Navigate to="/hrcurve?tab=effizienz" replace />} />
                <Route path="/route-comparison" element={<RouteComparisonPage />} />
                <Route path="/route-comparison/:id" element={<RouteComparisonPage />} />
                <Route path="/strecken" element={<RenamedRouteRedirect to="/route-comparison" />} />
                <Route path="/strecken/:id" element={<RenamedRouteRedirect to="/route-comparison" />} />
                <Route path="/tempcorr" element={<TempCorrPage />} />
                <Route path="/timeheatmap" element={<Navigate to="/progress?tab=tageszeit" replace />} />
                <Route path="/training" element={<Navigate to="/progress?tab=volumen" replace />} />
                <Route path="/wrapped" element={<WrappedPage />} />
                <Route path="/calculations" element={<CalculationsPage />} />
                <Route path="/berechnungen" element={<Navigate to="/calculations" replace />} />
                <Route path="/cadence" element={<CadencePage />} />
                <Route path="/calories" element={<CaloriesPage />} />
                <Route path="/speed-trend" element={<SpeedTrendPage />} />
                <Route path="/workouts/:id" element={<WorkoutDetailPage />} />
                <Route path="/weekend" element={<WeekendPage />} />
                <Route path="/fitness" element={<FitnessPage />} />
                <Route path="/zone-distribution" element={<ZoneDistributionPage />} />
              </Routes>
            </Suspense>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppGate() {
  const { loading, onboardingCompleted } = useOnboarding();
  // Hier statt in AppRoutes, damit i18next auch während des Setup-Wizards (der Schritt
  // "Sprache" ausgenommen, siehe SetupWizard.tsx) synchron zur gewählten Sprache bleibt.
  useSyncLanguage();
  // Solange die Settings noch nicht geladen sind, nichts rendern – sonst würde für einen
  // kurzen Moment die normale App (oder fälschlich der Wizard) aufblitzen.
  if (loading) return null;
  return onboardingCompleted ? <AppRoutes /> : <SetupWizard />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <BrowserRouter>
          <AppGate />
        </BrowserRouter>
      </ConfigProvider>
    </ThemeProvider>
  );
}
