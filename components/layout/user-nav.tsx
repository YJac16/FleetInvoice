"use client";

import { useTransition } from "react";
import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/constants";
import { signOut } from "@/services/auth.service";
import type { SessionContext } from "@/types/auth";
import { formatFullName, getInitials } from "@/utils/format";

interface UserNavProps {
  session: SessionContext;
}

export function UserNav({ session }: UserNavProps) {
  const [isPending, startTransition] = useTransition();
  const name = formatFullName(session.fullName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="relative h-9 gap-2 rounded-full px-2"
            aria-label="Open user menu"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {getInitials(session.fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[120px] truncate text-sm font-medium md:inline">
          {name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session.email}
            </p>
            <Badge variant="secondary" className="w-fit capitalize">
              {session.role}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={ROUTES.settings} />}>
          <User />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={ROUTES.settings} />}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
        >
          <LogOut />
          {isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
