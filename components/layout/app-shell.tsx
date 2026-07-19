import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import type { SessionContext } from "@/types/auth";

interface AppShellProps {
  session: SessionContext;
  children: React.ReactNode;
}

export function AppShell({ session, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <AppSidebar role={session.role} />
      </div>
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <AppHeader session={session} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
