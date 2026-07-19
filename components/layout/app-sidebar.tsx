"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/constants";
import { getNavItemsForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface AppSidebarProps {
  role: UserRole;
  className?: string;
  onNavigate?: () => void;
}

export function AppSidebar({ role, className, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const items = getNavItemsForRole(role);

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Truck className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
          <p className="text-[11px] text-muted-foreground">Transport ops</p>
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {items.map((item) => {
            const active =
              item.href === "/trips"
                ? pathname === "/trips" ||
                  (/^\/trips\/[^/]+$/.test(pathname) &&
                    pathname !== "/trips/new")
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium capitalize text-foreground">{role}</span>
        </p>
      </div>
    </aside>
  );
}
