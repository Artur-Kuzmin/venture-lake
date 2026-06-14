import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

// Authenticated application shell: a persistent left sidebar beside the main
// workspace. All authenticated routes render inside the workspace area.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell app-shell--authed">
      <Sidebar />
      <div className="app-workspace">
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
