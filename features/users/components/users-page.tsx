"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  inviteSchema,
  roleSchema,
  type InviteValues,
  type RoleValues,
} from "@/features/users/schemas/user";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  type AppRole,
  type InvitableRole,
} from "@/lib/constants";
import {
  activateMember,
  createInvitation,
  listInvitations,
  listMembers,
  revokeInvitation,
  suspendMember,
  updateMemberRole,
} from "@/services/users.service";
import type { Invitation, OrganisationMember } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { MemberScopesDialog } from "@/features/users/components/member-scopes-dialog";

const roleOptions = INVITABLE_ROLES.map((role) => ({
  label: ROLE_LABELS[role],
  value: role,
}));

function InviteForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (values: InviteValues) => void;
  submitting: boolean;
}) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "employee" },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <TextField
        control={form.control}
        name="email"
        label="Email"
        type="email"
        placeholder="colleague@company.com"
      />
      <SelectField
        control={form.control}
        name="role"
        label="Role"
        options={roleOptions}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}

function RoleForm({
  initialRole,
  onSubmit,
  submitting,
}: {
  initialRole: InvitableRole;
  onSubmit: (values: RoleValues) => void;
  submitting: boolean;
}) {
  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: initialRole },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <SelectField
        control={form.control}
        name="role"
        label="Role"
        options={roleOptions}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Update role"}
      </Button>
    </form>
  );
}

function isInvitableRole(role: AppRole): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

export function UsersPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("users:manage");
  const canView = can("users:view");
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleMember, setRoleMember] = useState<OrganisationMember | null>(null);
  const [scopeMember, setScopeMember] = useState<OrganisationMember | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<Invitation | null>(null);

  const membersQuery = useQuery({
    queryKey: organisationId ? queryKeys.members(organisationId) : ["members", "none"],
    queryFn: () => listMembers(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const invitationsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.invitations(organisationId)
      : ["invitations", "none"],
    queryFn: () => listInvitations(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteValues) =>
      createInvitation({
        organisationId: organisationId!,
        email: values.email,
        role: values.role,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.invitations(organisationId!),
      });
      toast.success(
        `Invitation created and queued for email. Link: ${result.inviteUrl}`
      );
      setInviteOpen(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: AppRole }) =>
      updateMemberRole(memberId, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.members(organisationId!),
      });
      toast.success("Role updated");
      setRoleMember(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const suspendMutation = useMutation({
    mutationFn: (memberId: string) => suspendMember(memberId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.members(organisationId!),
      });
      toast.success("Member suspended");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const activateMutation = useMutation({
    mutationFn: (memberId: string) => activateMember(memberId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.members(organisationId!),
      });
      toast.success("Member activated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(invitationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.invitations(organisationId!),
      });
      toast.success("Invitation revoked");
      setRevokeInvite(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const memberColumns = useMemo<ColumnDef<OrganisationMember, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => row.original.profiles?.full_name ?? "—",
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => row.original.profiles?.email ?? "—",
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => ROLE_LABELS[row.original.role] ?? row.original.role,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: OrganisationMember } }) => {
                const member = row.original;
                return (
                  <div className="flex flex-wrap justify-end gap-2">
                    {isInvitableRole(member.role) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRoleMember(member)}
                      >
                        Change role
                      </Button>
                    ) : null}
                    {member.role === "company_manager" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScopeMember(member)}
                      >
                        Scopes
                      </Button>
                    ) : null}
                    {member.status === "suspended" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => activateMutation.mutate(member.id)}
                      >
                        Activate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => suspendMutation.mutate(member.id)}
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                );
              },
            } satisfies ColumnDef<OrganisationMember, unknown>,
          ]
        : []),
    ],
    [canManage, activateMutation, suspendMutation]
  );

  const invitationColumns = useMemo<ColumnDef<Invitation, unknown>[]>(
    () => [
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => ROLE_LABELS[row.original.role] ?? row.original.role,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "expires_at",
        header: "Expires",
        cell: ({ row }) => formatDate(row.original.expires_at),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: Invitation } }) =>
                row.original.status === "pending" ? (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeInvite(row.original)}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : null,
            } satisfies ColumnDef<Invitation, unknown>,
          ]
        : []),
    ],
    [canManage]
  );

  if (!organisationId) {
    return (
      <div>
        <PageHeader
          title="Users"
          description="Invite and manage organisation members."
        />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to manage users."
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div>
        <PageHeader title="Users" />
        <EmptyState
          title="Access denied"
          description="You do not have permission to view users."
        />
      </div>
    );
  }

  const pendingInvites = (invitationsQuery.data ?? []).filter(
    (invite) => invite.status === "pending"
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Invite and manage organisation members."
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" />
              Invite user
            </Button>
          ) : null
        }
      />

      <section className="mb-10 space-y-4">
        <h2 className="font-heading text-xl tracking-tight">Members</h2>
        {membersQuery.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : (membersQuery.data ?? []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Invite someone to join this organisation."
            actionLabel={canManage ? "Invite user" : undefined}
            onAction={canManage ? () => setInviteOpen(true) : undefined}
          />
        ) : (
          <DataTable columns={memberColumns} data={membersQuery.data ?? []} />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl tracking-tight">Pending invitations</h2>
        {invitationsQuery.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : pendingInvites.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="Sent invitations that are still open will appear here."
          />
        ) : (
          <DataTable columns={invitationColumns} data={pendingInvites} />
        )}
      </section>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite user"
        description="They will receive an invite link to join this organisation."
      >
        <InviteForm
          submitting={inviteMutation.isPending}
          onSubmit={(values) => inviteMutation.mutate(values)}
        />
      </FormDialog>

      <FormDialog
        open={Boolean(roleMember)}
        onOpenChange={(open) => !open && setRoleMember(null)}
        title="Change role"
      >
        {roleMember && isInvitableRole(roleMember.role) ? (
          <RoleForm
            key={roleMember.id}
            initialRole={roleMember.role}
            submitting={roleMutation.isPending}
            onSubmit={(values) =>
              roleMutation.mutate({ memberId: roleMember.id, role: values.role })
            }
          />
        ) : null}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(revokeInvite)}
        onOpenChange={(open) => !open && setRevokeInvite(null)}
        title="Revoke invitation?"
        description="The invite link will stop working."
        confirmLabel="Revoke"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (!revokeInvite) return;
          revokeMutation.mutate(revokeInvite.id);
        }}
      />

      <MemberScopesDialog
        open={Boolean(scopeMember)}
        onOpenChange={(open) => !open && setScopeMember(null)}
        member={scopeMember}
        organisationId={organisationId}
      />
    </div>
  );
}
