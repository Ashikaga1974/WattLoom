import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

// Nur sichtbar, wenn die Sidebar es nicht ist (Mobil-Modus oder eingeklappt) – sonst gäbe es
// außer Strg+B keinen Weg zurück, und Firefox belegt Strg+B selbst mit der Lesezeichen-Leiste.
export function SidebarToggleBar() {
  const { isMobile, state } = useSidebar();
  if (!isMobile && state === 'expanded') return null;
  return (
    <div className="sticky top-0 z-20 flex items-center border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      <SidebarTrigger />
    </div>
  );
}
