import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Activity,
  Map,
  BarChart2,
  Bike,
  Settings,
  HelpCircle,
  Calendar,
  Trophy,
  Flame,
  TrendingUp,
  Zap,
  Heart,
  BarChart,
  Route,
  GitCompare,
  Cookie,
} from 'lucide-react';

interface NavSubItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface NavGroup {
  href: string;
  label: string;
  icon: React.ReactNode;
  prefixes: string[];
  children?: NavSubItem[];
}

const navGroups: NavGroup[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    prefixes: ['/'],
  },
  {
    href: '/activities',
    label: 'Aktivitäten',
    icon: <Activity size={16} />,
    prefixes: ['/activities', '/calendar', '/best'],
    children: [
      { href: '/activities', label: 'Liste', icon: <Activity size={13} /> },
      { href: '/calendar',   label: 'Kalender', icon: <Calendar size={13} /> },
      { href: '/best',       label: 'Best of', icon: <Trophy size={13} /> },
    ],
  },
  {
    href: '/heatmap',
    label: 'Karte',
    icon: <Map size={16} />,
    prefixes: ['/heatmap', '/routes', '/strecken'],
    children: [
      { href: '/heatmap',  label: 'Heatmap', icon: <Map size={13} /> },
      { href: '/routes',   label: 'Top-Strecken', icon: <Route size={13} /> },
      { href: '/strecken', label: 'Streckenvergleich', icon: <GitCompare size={13} /> },
    ],
  },
  {
    href: '/progress',
    label: 'Analyse',
    icon: <BarChart2 size={16} />,
    prefixes: ['/progress', '/fatigue', '/ftp', '/hrcurve', '/cadence', '/form', '/tempcorr', '/stats', '/wrapped', '/calories', '/speed-trend'],
    children: [
      { href: '/progress',      label: 'Jahresübersicht', icon: <TrendingUp size={13} /> },
      { href: '/fatigue', label: 'Ermüdung', icon: <Flame size={13} /> },
      { href: '/ftp',           label: 'FTP', icon: <Zap size={13} /> },
      { href: '/hrcurve',       label: 'HR-Analyse', icon: <Heart size={13} /> },
      { href: '/cadence',       label: 'Kadenz', icon: <Activity size={13} /> },
      { href: '/form',          label: 'Form (PMC)', icon: <TrendingUp size={13} /> },
      { href: '/tempcorr',      label: 'Wetter & Leistung', icon: <BarChart size={13} /> },
      { href: '/timeheatmap',   label: 'Tageszeit', icon: <Map size={13} /> },
      { href: '/calories',      label: 'Kalorien', icon: <Cookie size={13} /> },
      { href: '/speed-trend',   label: 'Tempoentwicklung', icon: <TrendingUp size={13} /> },
      { href: '/wrapped',       label: 'Jahresrückblick', icon: <Trophy size={13} /> },
    ],
  },
  {
    href: '/bikes',
    label: 'Bikes',
    icon: <Bike size={16} />,
    prefixes: ['/bikes'],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const p = location.pathname;

  function isGroupActive(prefixes: string[]) {
    if (prefixes.length === 1 && prefixes[0] === '/') return p === '/';
    return prefixes.some(prefix => p.startsWith(prefix));
  }

  function isSubActive(href: string) {
    if (href === '/activities') return p === '/activities' || (p.startsWith('/activities/') && !p.startsWith('/activities/stats'));
    if (href === '/bikes') return p === '/bikes';
    return p === href || p.startsWith(href + '/');
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Bike size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">MyBiking</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navGroups.map(group => {
                const active = isGroupActive(group.prefixes);
                return (
                  <SidebarMenuItem key={group.href}>
                    <SidebarMenuButton
                      render={<Link to={group.href} />}
                      isActive={active && !group.children}
                    >
                      {group.icon}
                      <span>{group.label}</span>
                    </SidebarMenuButton>

                    {group.children && active && (
                      <SidebarMenuSub>
                        {group.children.map(sub => (
                          <SidebarMenuSubItem key={sub.href}>
                            <SidebarMenuSubButton
                              render={<Link to={sub.href} />}
                              isActive={isSubActive(sub.href)}
                            >
                              {sub.icon}
                              <span>{sub.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/berechnungen" />}
              isActive={p === '/berechnungen'}
            >
              <HelpCircle size={16} />
              <span>Berechnungen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/settings" />}
              isActive={p === '/settings'}
            >
              <Settings size={16} />
              <span>Einstellungen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
