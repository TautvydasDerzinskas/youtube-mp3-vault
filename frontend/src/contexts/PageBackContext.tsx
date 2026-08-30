import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface PageBackTarget {
  path: string;
  label: string;
}

interface PageBackContextType {
  backTarget: PageBackTarget | null;
  setBackTarget: (target: PageBackTarget | null) => void;
  // Lets a routed page hand its heading to TopBar (see usePageTitle below)
  // instead of rendering it inline, freeing up vertical space in the
  // content viewport — same registration pattern as backTarget.
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;
}

const PageBackContext = createContext<PageBackContextType | null>(null);

// Layout-scoped (mounted inside AppLayout, same as PlayerProvider) rather
// than app-wide — only relevant to the routed pages under <Outlet /> and the
// TopBar/MobileTopBar that read it, both of which live inside AppLayout.
export function PageBackProvider({ children }: { children: ReactNode }) {
  const [backTarget, setBackTarget] = useState<PageBackTarget | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  return (
    <PageBackContext.Provider value={{ backTarget, setBackTarget, pageTitle, setPageTitle }}>
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

// Same pattern as usePageBack, for a page's heading — TopBar renders it
// next to the back button (desktop only; mobile pages still render their
// own inline heading, see e.g. GenresPage). Independent of usePageBack so a
// page can register a title with no back button (e.g. Playlists) or vice
// versa.
export function usePageTitle(title: string | null): void {
  const { setPageTitle } = usePageBackContext();
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
}
