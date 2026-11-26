"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePreservedRangeHref } from "@/hooks/use-preserved-range-href";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { GoOpsLogo } from "@/components/brand/goops-logo";
import { useOrg } from "@/components/layout/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MAIN_NAV,
  NAV_GROUPS,
  SECONDARY_NAV,
  type NavGroupId,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Desktop rail collapse preference. Not used by the phone sheet menu. */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "goops.sidebar.collapsed.v1";

type AppSidebarProps = {
  onNavigate?: () => void;
  /** Desktop rail only: enables the collapse control and persists the state. */
  rail?: boolean;
};

function useRailCollapsed(enabled: boolean) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable: stay expanded */
    }
  }, [enabled]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return enabled ? ([collapsed, toggle] as const) : ([false, toggle] as const);
}

function NavLink({
  item,
  active,
  onNavigate,
  iconOnly = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  iconOnly?: boolean;
}) {
  const rangeHref = usePreservedRangeHref();
  const Icon = item.icon;
  return (
    <Link
      href={rangeHref(item.href)}
      onClick={onNavigate}
      title={iconOnly ? item.title : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
        iconOnly && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/25 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={iconOnly ? "sr-only" : undefined}>{item.title}</span>
    </Link>
  );
}

export function AppSidebar({ onNavigate, rail = false }: AppSidebarProps) {
  const pathname = usePathname();
  const { can, canModule } = useOrg();
  const [collapsed, setCollapsed] = useState<Partial<Record<NavGroupId, boolean>>>(
    {}
  );
  const [filter, setFilter] = useState("");
  const [railCollapsed, toggleRail] = useRailCollapsed(rail);

  const primary = useMemo(
    () =>
      MAIN_NAV.filter(
        (item) => can(item.permission) && canModule(item.module)
      ),
    [can, canModule]
  );
  const secondary = useMemo(
    () =>
      SECONDARY_NAV.filter(
        (item) => can(item.permission) && canModule(item.module)
      ),
    [can, canModule]
  );

  const filterQuery = filter.trim().toLowerCase();

  const grouped = useMemo(() => {
    const filtered = filterQuery
      ? primary.filter((item) => item.title.toLowerCase().includes(filterQuery))
      : primary;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: filtered.filter((item) => item.group === group.id),
    })).filter((group) => group.items.length > 0);
  }, [primary, filterQuery]);

  const filteredSecondary = useMemo(() => {
    if (!filterQuery) return secondary;
    return secondary.filter((item) =>
      item.title.toLowerCase().includes(filterQuery)
    );
  }, [secondary, filterQuery]);

  const activeGroupId = useMemo(() => {
    for (const group of grouped) {
      for (const item of group.items) {
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          return group.id;
        }
      }
    }
    return null;
  }, [grouped, pathname]);

  function isGroupOpen(groupId: NavGroupId) {
    if (railCollapsed || filterQuery) return true;
    if (collapsed[groupId] !== undefined) return !collapsed[groupId];
    return groupId === "overview" || groupId === activeGroupId;
  }

  function toggleGroup(groupId: NavGroupId) {
    setCollapsed((prev) => {
      const wasCollapsed = prev[groupId] === true;
      return { ...prev, [groupId]: !wasCollapsed };
    });
  }

  return (
    <aside
      data-collapsed={railCollapsed ? "true" : undefined}
      className={cn(
        "flex min-h-screen flex-1 flex-col border-r bg-sidebar text-sidebar-foreground",
        rail
          ? cn(
              "motion-safe:transition-[width] motion-safe:duration-200 motion-reduce:transition-none",
              railCollapsed ? "w-16" : "w-64"
            )
          : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center",
          railCollapsed ? "justify-center px-2" : "justify-between px-5"
        )}
      >
        {railCollapsed ? null : (
          <GoOpsLogo variant="sidebar" href="/dashboard" onClick={onNavigate} />
        )}
        {rail ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!railCollapsed}
          >
            {railCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        ) : null}
      </div>
      <Separator />
      {railCollapsed ? null : (
        <div className="px-3 pt-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter pages…"
            aria-label="Filter pages"
            className="h-9"
          />
        </div>
      )}
      <ScrollArea className={cn("flex-1 py-4", railCollapsed ? "px-2" : "px-3")}>
        <nav className="space-y-3">
          {grouped.map((group) => {
            const open = isGroupOpen(group.id);
            return (
              <div key={group.id}>
                {railCollapsed ? (
                  <Separator className="mb-2 first:hidden" />
                ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="mb-1 flex w-full items-center justify-between px-3 text-[11px] font-medium tracking-wide text-sidebar-foreground/60 uppercase"
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      open ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>
                )}
                {open ? (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                      return (
                        <NavLink
                          key={item.href}
                          item={item}
                          active={active}
                          onNavigate={onNavigate}
                          iconOnly={railCollapsed}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        {filteredSecondary.length ? (
          <>
            <Separator className="my-4" />
            <nav className="space-y-1">
              {filteredSecondary.map((item) => {
                const active = pathname === item.href;
                return (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={active}
                    onNavigate={onNavigate}
                    iconOnly={railCollapsed}
                  />
                );
              })}
            </nav>
          </>
        ) : null}
        {filterQuery && !grouped.length && !filteredSecondary.length ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            No pages match “{filter.trim()}”.
          </p>
        ) : null}
      </ScrollArea>
    </aside>
  );
}
