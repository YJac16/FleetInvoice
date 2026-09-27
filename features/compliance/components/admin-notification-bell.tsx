"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  adminUnreadCount,
  listMyAdminNotifications,
  markAdminNotificationRead,
} from "@/services/admin-notifications.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

export function AdminNotificationBell() {
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.adminNotifications(organisationId)
      : ["admin-notifications", "none"],
    queryFn: () => listMyAdminNotifications(organisationId!),
    enabled: Boolean(organisationId),
    refetchInterval: 60_000,
  });

  const notifications = notificationsQuery.data ?? [];
  const unread = adminUnreadCount(notifications);

  const readMutation = useMutation({
    mutationFn: markAdminNotificationRead,
    onSuccess: async () => {
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.adminNotifications(organisationId),
        });
      }
    },
  });

  if (!organisationId) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Compliance alerts">
            <Bell className="size-4" />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <SheetContent side="right" className="w-full max-w-sm">
        <SheetHeader>
          <SheetTitle>Compliance alerts</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts yet.</p>
          ) : (
            <ul className="space-y-2 pr-2">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50",
                      !item.read_at && "border-primary/30 bg-primary/5"
                    )}
                    onClick={() => {
                      if (!item.read_at) readMutation.mutate(item.id);
                      setOpen(false);
                    }}
                  >
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-muted-foreground">{item.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </p>
                    {item.link_path ? (
                      <Link
                        href={item.link_path}
                        className="mt-2 inline-block text-xs text-primary underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
