import type { ReactNode } from 'react';

// Frames About/Pricing/Help inside the app canvas, next to the dock.
export default function InAppPage({ children }: { children: ReactNode }) {
  return <div className="in-app-page">{children}</div>;
}
