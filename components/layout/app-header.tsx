"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { OrganisationSwitcher } from "@/components/layout/organisation-switcher";
import { UserNav } from "@/components/layout/user-nav";
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <OrganisationSwitcher />
      <div className="ml-auto flex items-center gap-1">
        <UserNav />
      </div>
    </header>
  );
}
