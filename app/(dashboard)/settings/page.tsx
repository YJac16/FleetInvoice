import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/services/profile.service";
import { formatFullName } from "@/utils/format";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSessionContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account preferences and workspace defaults for your FleetInvoice profile."
        actions={
          <Badge variant="secondary" className="capitalize">
            {session?.role ?? "user"}
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="size-4 text-muted-foreground" />
              Profile
            </CardTitle>
            <CardDescription>
              Details loaded from your authenticated Supabase profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">
                {formatFullName(session?.fullName)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{session?.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">
                {session?.role ?? "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
            <CardDescription>
              Theme can be changed from the top navigation. Additional
              preferences will land in a later phase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Light, dark, and system themes are supported.</p>
            <p>Notification preferences are not configured in Phase 1.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
