"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { SessionTabListener } from "@/components/auth/session-tab-listener";
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
        {children}
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
