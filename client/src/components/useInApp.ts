import { useLocation } from 'react-router';

// About, Pricing and Help render both logged out (/about) and inside the
// app shell (/app/about). Pages use this to pick links and calls to action.
export function useInApp(): boolean {
  return useLocation().pathname.startsWith('/app');
}

export function useSitePath(): (page: 'about' | 'pricing' | 'help') => string {
  const inApp = useInApp();
  return (page) => (inApp ? `/app/${page}` : `/${page}`);
}
