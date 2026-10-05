import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// null = noch nicht geladen. Umschalten lädt die Seite komplett neu (siehe DemoModeCard),
// deshalb reicht einmaliges Laden pro Mount.
export function useDemoMode(): boolean | null {
  const [isActive, setIsActive] = useState<boolean | null>(null);

  useEffect(() => {
    let ignore = false;
    api.demoMode().then(res => { if (!ignore) setIsActive(res.active); }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  return isActive;
}
