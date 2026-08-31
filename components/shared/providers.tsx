"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

<<<<<<< HEAD
import { SessionTabListener } from "@/components/auth/session-tab-listener";
=======
>>>>>>> origin/cursor/workops-phase1-foundation
import { Toaster } from "@/components/ui/sonner";
import { WhiteLabelTheme } from "@/components/layout/white-label-theme";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <WhiteLabelTheme />
<<<<<<< HEAD
        <SessionTabListener />
=======
>>>>>>> origin/cursor/workops-phase1-foundation
        {children}
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
