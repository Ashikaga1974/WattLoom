import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/AppSidebar';

import DashboardPage from '@/pages/DashboardPage';
import ActivitiesPage from '@/pages/ActivitiesPage';
import ActivityDetailPage from '@/pages/ActivityDetailPage';
import BestPage from '@/pages/BestPage';
import BikesPage from '@/pages/BikesPage';
import BikeComparePage from '@/pages/BikeComparePage';
import CalendarPage from '@/pages/CalendarPage';
import ComparePage from '@/pages/ComparePage';
import FormPage from '@/pages/FormPage';
import FtpPage from '@/pages/FtpPage';
import HeatmapPage from '@/pages/HeatmapPage';
import HrCurvePage from '@/pages/HrCurvePage';
import ProgressPage from '@/pages/ProgressPage';
import SettingsPage from '@/pages/SettingsPage';
import RoutesPage from '@/pages/RoutesPage';
import SpeedHrPage from '@/pages/SpeedHrPage';
import StreckenPage from '@/pages/StreckenPage';
import TempCorrPage from '@/pages/TempCorrPage';
import TimeHeatmapPage from '@/pages/TimeHeatmapPage';
import TrainingPage from '@/pages/TrainingPage';
import WrappedPage from '@/pages/WrappedPage';
import BerechnungenPage from '@/pages/BerechnungenPage';
import CadencePage from '@/pages/CadencePage';
import FatigueIndexPage from '@/pages/FatigueIndexPage';
import CaloriesPage from '@/pages/CaloriesPage';

export default function App() {
  return (
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
                <Route path="/bikes/compare" element={<BikeComparePage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/form" element={<FormPage />} />
                <Route path="/ftp" element={<FtpPage />} />
                <Route path="/heatmap" element={<HeatmapPage />} />
                <Route path="/hrcurve" element={<HrCurvePage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/routes" element={<RoutesPage />} />
                <Route path="/speedhr" element={<SpeedHrPage />} />
                <Route path="/strecken" element={<StreckenPage />} />
                <Route path="/strecken/:id" element={<StreckenPage />} />
                <Route path="/tempcorr" element={<TempCorrPage />} />
                <Route path="/timeheatmap" element={<TimeHeatmapPage />} />
                <Route path="/training" element={<TrainingPage />} />
                <Route path="/wrapped" element={<WrappedPage />} />
                <Route path="/berechnungen" element={<BerechnungenPage />} />
                <Route path="/cadence" element={<CadencePage />} />
                <Route path="/fatigue-index" element={<FatigueIndexPage />} />
                <Route path="/calories" element={<CaloriesPage />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}
