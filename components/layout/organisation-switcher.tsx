"use client";

import { ChevronsUpDown } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OrganisationSwitcher() {
  const { memberships, activeOrganisationId, setActiveOrganisationId, isPlatformOwner } =
    useOrg();

  if (!memberships.length && !isPlatformOwner) {
    return null;
  }

  const active = memberships.find(
    (m) => m.organisation_id === activeOrganisationId
  );
  const label =
    active?.organisations?.name ??
    (isPlatformOwner ? "All organisations" : "Select organisation");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="w-full min-w-0 max-w-full shrink justify-between gap-1 md:w-auto md:max-w-none md:min-w-45"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-55">
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.id}
            onClick={() => setActiveOrganisationId(membership.organisation_id)}
          >
            {membership.organisations?.name ?? membership.organisation_id}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
