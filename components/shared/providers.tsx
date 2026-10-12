"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Suspense, useState, type ReactNode } from "react";

import { SessionTabListener } from "@/components/auth/session-tab-listener";
import { RouteProgressBar } from "@/components/navigation/route-progress-bar";
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
        <SessionTabListener />
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
