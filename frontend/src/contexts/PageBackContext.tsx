import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface PageBackTarget {
  path: string;
  label: string;
}

interface PageBackContextType {
  backTarget: PageBackTarget | null;
  setBackTarget: (target: PageBackTarget | null) => void;
}

const PageBackContext = createContext<PageBackContextType | null>(null);

// Layout-scoped (mounted inside AppLayout, same as PlayerProvider) rather
// than app-wide — only relevant to the routed pages under <Outlet /> and the
// TopBar/MobileTopBar that read it, both of which live inside AppLayout.
export function PageBackProvider({ children }: { children: ReactNode }) {
  const [backTarget, setBackTarget] = useState<PageBackTarget | null>(null);
  return (
    <PageBackContext.Provider value={{ backTarget, setBackTarget }}>
      {children}
    </PageBackContext.Provider>
  );
}

export function usePageBackContext(): PageBackContextType {
  const ctx = useContext(PageBackContext);
  if (!ctx) throw new Error('usePageBackContext must be used within PageBackProvider');
  return ctx;
}

// Convenience hook for a routed page to register the back button TopBar/
// MobileTopBar render on its behalf — replaces every page's own inline
// back-arrow IconButton (see TopBar.tsx). Registers on mount and whenever
// path/label change, clears on unmount, so navigating from a page that had
// one to a page that doesn't (e.g. the Playlists list) correctly hides it
// again rather than leaving a stale target behind. Pass path: null for a
// page whose back destination isn't known yet (e.g. still loading route
// params) — no back button shows until it's set.
export function usePageBack(path: string | null, label: string): void {
  // setBackTarget is a useState setter, so it's already referentially
  // stable across renders — safe to use directly as an effect dependency.
  const { setBackTarget } = usePageBackContext();
  useEffect(() => {
    setBackTarget(path ? { path, label } : null);
    return () => setBackTarget(null);
  }, [path, label, setBackTarget]);
}
