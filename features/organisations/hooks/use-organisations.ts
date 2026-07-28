"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createOrganisation,
  listOrganisations,
  softDeleteOrganisation,
  updateOrganisation,
} from "@/services/organisations.service";
import type { Organisation } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

export function useOrganisations() {
  return useQuery({
    queryKey: queryKeys.organisations,
    queryFn: listOrganisations,
  });
}

export function useCreateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug?: string }) =>
      createOrganisation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organisations });
      toast.success("Organisation created");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useUpdateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Organisation, "name" | "slug" | "logo_url" | "status" | "settings">>;
    }) => updateOrganisation(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organisations });
      toast.success("Organisation updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useSoftDeleteOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteOrganisation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organisations });
      toast.success("Organisation deleted");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
