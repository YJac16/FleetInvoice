"use client";

import { Bell } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/layout/user-nav";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionContext } from "@/types/auth";

interface AppHeaderProps {
  session: SessionContext;
  title?: string;
}

export function AppHeader({ session, title }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav role={session.role} />
        {title ? (
          <p className="truncate text-sm font-medium text-muted-foreground lg:hidden">
            {title}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                className="relative"
              />
            }
          >
            <Bell className="size-4" />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent" />
          </TooltipTrigger>
          <TooltipContent>Notifications coming soon</TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <UserNav session={session} />
      </div>
    </header>
  );
}
