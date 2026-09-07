"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createServiceLocation,
  listServiceLocations,
} from "@/services/locations.service";
import { getErrorMessage } from "@/utils/errors";

export function ServiceLocationsSettings({
  organisationId,
}: {
  organisationId: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const locationsQuery = useQuery({
    queryKey: ["service-locations", organisationId],
    queryFn: () => listServiceLocations(organisationId),
  });

  const orgLocations = (locationsQuery.data ?? []).filter(
    (location) => location.organisation_id === organisationId
  );
  const sharedCount = (locationsQuery.data ?? []).filter(
    (location) => location.organisation_id === null
  ).length;

  const createMutation = useMutation({
    mutationFn: () => createServiceLocation(organisationId, name),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({
        queryKey: ["service-locations", organisationId],
      });
      toast.success("Location added");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Service locations</CardTitle>
        <CardDescription>
          Cape Town metro place names for trip and invoice AREA fields. Shared
          catalogue: {sharedCount} places. Org-specific: {orgLocations.length}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-location-name">Add org location</Label>
          <div className="flex gap-2">
            <Input
              id="new-location-name"
              value={name}
              placeholder="e.g. Nyanga"
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Add
            </Button>
          </div>
        </div>
        {orgLocations.length > 0 ? (
          <ul className="text-sm text-muted-foreground">
            {orgLocations.map((location) => (
              <li key={location.id}>{location.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No org-specific locations yet — the shared Cape Town catalogue is
            used for autocomplete.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
