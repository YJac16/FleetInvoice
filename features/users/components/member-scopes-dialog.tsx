"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCompanies } from "@/services/companies.service";
import {
  addMemberScope,
  listMemberScopes,
  removeMemberScope,
} from "@/services/member-scopes.service";
import { writeAuditLog } from "@/services/audit.service";
import type { OrganisationMember } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type MemberScopesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrganisationMember | null;
  organisationId: string;
};

export function MemberScopesDialog({
  open,
  onOpenChange,
  member,
  organisationId,
}: MemberScopesDialogProps) {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState("");

  const companiesQuery = useQuery({
    queryKey: queryKeys.companies(organisationId),
    queryFn: () => listCompanies(organisationId),
    enabled: open && Boolean(organisationId),
  });

  const scopesQuery = useQuery({
    queryKey: ["member-scopes", organisationId, member?.id],
    queryFn: () => listMemberScopes(organisationId, member!.id),
    enabled: open && Boolean(member?.id),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!member || !companyId) throw new Error("Select a company");
      const scope = await addMemberScope({
        organisationId,
        membershipId: member.id,
        companyId,
      });
      try {
        await writeAuditLog({
          organisationId,
          action: "member_scope.added",
          entityType: "member_scope",
          entityId: scope.id,
          metadata: { membership_id: member.id, company_id: companyId },
        });
      } catch {
        // best-effort
      }
      return scope;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["member-scopes", organisationId, member?.id],
      });
      setCompanyId("");
      toast.success("Company scope added");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: async (scopeId: string) => {
      await removeMemberScope(scopeId);
      try {
        await writeAuditLog({
          organisationId,
          action: "member_scope.removed",
          entityType: "member_scope",
          entityId: scopeId,
        });
      } catch {
        // best-effort
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["member-scopes", organisationId, member?.id],
      });
      toast.success("Company scope removed");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const companies = companiesQuery.data ?? [];
  const scopes = scopesQuery.data ?? [];
  const companyName = (id: string) =>
    companies.find((c) => c.id === id)?.name ?? id;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Company scopes"
      description={
        member
          ? `Limit ${member.profiles?.email ?? "this company manager"} to selected client companies. Scopes also control employees and sites for that company.`
          : undefined
      }
    >
      {companiesQuery.isLoading || scopesQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select
              value={companyId}
              onValueChange={(value) => setCompanyId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!companyId || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
          </div>

          {scopes.length === 0 ? (
            <EmptyState
              title="No company scopes"
              description="Company managers see no client data until at least one scope is assigned."
            />
          ) : (
            <ul className="space-y-2">
              {scopes.map((scope) => (
                <li
                  key={scope.id}
                  className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                >
                  <span>{companyName(scope.company_id)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate(scope.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FormDialog>
  );
}
