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
            className="relative text-zinc-300 hover:text-white"
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
      <SheetContent side="right" className="w-full max-w-sm bg-zinc-950 text-zinc-100">
        <SheetHeader>
          <SheetTitle className="text-white">Alerts</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
          {notifications.length === 0 ? (
            <p className="px-1 text-sm text-zinc-500">No alerts yet.</p>
          ) : (
            <ul className="space-y-2 pr-3">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "rounded-lg border border-zinc-800 px-3 py-2",
                    !n.read_at && "border-zinc-600 bg-zinc-900"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (!n.read_at) readMutation.mutate(n.id);
                    }}
                  >
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="mt-0.5 text-sm text-zinc-400">{n.body}</p>
                    <p className="mt-1 text-xs text-zinc-600">
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
