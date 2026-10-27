"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  listMyDriverNotifications,
  markNotificationRead,
  unreadCount,
} from "@/services/driver-notifications.service";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";

export function NotificationBell() {
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverNotifications(organisationId)
      : ["driver-notifications", "none"],
    queryFn: () => listMyDriverNotifications(organisationId!),
    enabled: Boolean(organisationId),
    refetchInterval: 30_000,
  });

  const notifications = notificationsQuery.data ?? [];
  const unread = unreadCount(notifications);

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.driverNotifications(organisationId),
        });
      }
    },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0 text-muted-foreground"
            aria-label="Notifications"
          />
        }
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm bg-background text-foreground">
        <SheetHeader>
          <SheetTitle>Alerts</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
          {notifications.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">No alerts yet.</p>
          ) : (
            <ul className="space-y-2 pr-3">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "rounded-lg border border-border px-3 py-2",
                    !n.read_at && "border-foreground/25 bg-muted"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (!n.read_at) readMutation.mutate(n.id);
                    }}
                  >
                    <p className="break-words text-sm font-medium text-foreground">
                      {n.title}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">
                      {n.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(n.created_at)}
                    </p>
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
