"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { OrganisationSwitcher } from "@/components/layout/organisation-switcher";
import { PortalClock } from "@/components/layout/portal-clock";
import { UserNav } from "@/components/layout/user-nav";
import { AdminNotificationBell } from "@/features/compliance/components/admin-notification-bell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-6">
      <div className="shrink-0 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <div className="min-w-0 flex-1 md:flex-none">
        <OrganisationSwitcher />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <PortalClock className="mr-1" />
        <AdminNotificationBell />
        <UserNav />
      </div>
    </header>
  );
}
