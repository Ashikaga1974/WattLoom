import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
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
  TrendingUp,
  Heart,
  BarChart,
  GitCompare,
  Cookie,
  SunMoon,
  Fingerprint,
  ChevronDown,
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
    prefixes: ['/heatmap', '/strecken'],
    children: [
      { href: '/heatmap',  label: 'Heatmap', icon: <Map size={13} /> },
      { href: '/strecken', label: 'Streckenvergleich', icon: <GitCompare size={13} /> },
    ],
  },
  {
    href: '/progress',
    label: 'Analyse',
    icon: <BarChart2 size={16} />,
    prefixes: ['/progress', '/hrcurve', '/cadence', '/form', '/tempcorr', '/stats', '/wrapped', '/calories', '/speed-trend', '/weekend', '/fitness'],
    children: [
      { href: '/fitness',       label: 'Fitness-Score',    icon: <Fingerprint size={13} /> },
      { href: '/progress',      label: 'Jahresübersicht', icon: <TrendingUp size={13} /> },
      { href: '/hrcurve',       label: 'HR-Analyse', icon: <Heart size={13} /> },
      { href: '/cadence',       label: 'Kadenz', icon: <Activity size={13} /> },
      { href: '/form',          label: 'Form (PMC)', icon: <TrendingUp size={13} /> },
      { href: '/tempcorr',      label: 'Wetter & Leistung', icon: <BarChart size={13} /> },
      { href: '/calories',      label: 'Kalorien', icon: <Cookie size={13} /> },
      { href: '/speed-trend',   label: 'Tempoentwicklung', icon: <TrendingUp size={13} /> },
      { href: '/weekend',       label: 'Wochentag-Analyse', icon: <SunMoon size={13} /> },
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

  // Untermenüs standardmäßig aufgeklappt, einzeln zuklappbar
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.filter(g => g.children).map(g => [g.href, true]))
  );

  function toggleExpanded(href: string) {
    setExpanded(prev => ({ ...prev, [href]: !prev[href] }));
  }

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
          <span className="font-semibold text-base tracking-tight">RideForge</span>
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

                    {group.children && (
                      <SidebarMenuAction
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleExpanded(group.href);
                        }}
                        aria-label={expanded[group.href] ? 'Untermenü zuklappen' : 'Untermenü aufklappen'}
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${expanded[group.href] ? '' : '-rotate-90'}`}
                        />
                      </SidebarMenuAction>
                    )}

                    {group.children && expanded[group.href] && (
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
