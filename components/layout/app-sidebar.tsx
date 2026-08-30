"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/constants";
import {
  MAIN_NAV,
  NAV_GROUPS,
  SECONDARY_NAV,
  type NavGroupId,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  onNavigate?: () => void;
};

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.title}
    </Link>
  );
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const { can, canModule } = useOrg();
  const [collapsed, setCollapsed] = useState<Partial<Record<NavGroupId, boolean>>>(
    {}
  );
  const [filter, setFilter] = useState("");

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
    if (filterQuery) return true;
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
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="font-heading text-xl tracking-tight"
        >
          {APP_NAME}
        </Link>
      </div>
      <Separator />
      <div className="px-3 pt-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter pages…"
          aria-label="Filter pages"
          className="h-9"
        />
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-3">
          {grouped.map((group) => {
            const open = isGroupOpen(group.id);
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="mb-1 flex w-full items-center justify-between px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      open ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>
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
