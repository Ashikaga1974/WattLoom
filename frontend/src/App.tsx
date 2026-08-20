import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ConfigProvider } from '@/lib/config-context';

import DashboardPage from '@/pages/DashboardPage';
import ActivitiesPage from '@/pages/ActivitiesPage';
import ActivityDetailPage from '@/pages/ActivityDetailPage';
import BestPage from '@/pages/BestPage';
import BikesPage from '@/pages/BikesPage';
import CalendarPage from '@/pages/CalendarPage';
import FormPage from '@/pages/FormPage';
import HeatmapPage from '@/pages/HeatmapPage';
import HrCurvePage from '@/pages/HrCurvePage';
import ProgressPage from '@/pages/ProgressPage';
import SettingsPage from '@/pages/SettingsPage';
import StreckenPage from '@/pages/StreckenPage';
import TempCorrPage from '@/pages/TempCorrPage';
import WrappedPage from '@/pages/WrappedPage';
import BerechnungenPage from '@/pages/BerechnungenPage';
import CadencePage from '@/pages/CadencePage';
import CaloriesPage from '@/pages/CaloriesPage';
import SpeedTrendPage from '@/pages/SpeedTrendPage';
import WorkoutDetailPage from '@/pages/WorkoutDetailPage';
import WeekendPage from '@/pages/WeekendPage';
import FitnessPage from '@/pages/FitnessPage';

export default function App() {
  return (
    <ConfigProvider>
    <BrowserRouter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <main className="p-6 min-h-screen">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/activities" element={<ActivitiesPage />} />
                <Route path="/activities/:id" element={<ActivityDetailPage />} />
                <Route path="/best" element={<BestPage />} />
                <Route path="/bikes" element={<BikesPage />} />
                <Route path="/bikes/compare" element={<Navigate to="/bikes?tab=vergleich" replace />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/compare" element={<Navigate to="/progress?tab=vergleich" replace />} />
                <Route path="/form" element={<FormPage />} />
                <Route path="/heatmap" element={<HeatmapPage />} />
                <Route path="/hrcurve" element={<HrCurvePage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/routes" element={<Navigate to="/strecken" replace />} />
                <Route path="/speedhr" element={<Navigate to="/hrcurve?tab=effizienz" replace />} />
                <Route path="/strecken" element={<StreckenPage />} />
                <Route path="/strecken/:id" element={<StreckenPage />} />
                <Route path="/tempcorr" element={<TempCorrPage />} />
                <Route path="/timeheatmap" element={<Navigate to="/progress?tab=tageszeit" replace />} />
                <Route path="/training" element={<Navigate to="/progress?tab=volumen" replace />} />
                <Route path="/wrapped" element={<WrappedPage />} />
                <Route path="/berechnungen" element={<BerechnungenPage />} />
                <Route path="/cadence" element={<CadencePage />} />
                <Route path="/calories" element={<CaloriesPage />} />
                <Route path="/speed-trend" element={<SpeedTrendPage />} />
                <Route path="/workouts/:id" element={<WorkoutDetailPage />} />
                <Route path="/weekend" element={<WeekendPage />} />
                <Route path="/fitness" element={<FitnessPage />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </BrowserRouter>
    </ConfigProvider>
  );
}
