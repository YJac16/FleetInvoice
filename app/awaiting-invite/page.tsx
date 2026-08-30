import { redirect } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/auth/require-permission";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AwaitingInvitePage() {
  const session = await requireSession();

  if (session.isPlatformOwner || session.memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-auth-surface-simple px-6">
      <Card className="w-full max-w-md rounded-2xl shadow-none">
        <CardHeader>
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            {APP_NAME}
          </p>
          <CardTitle className="font-heading text-3xl">Awaiting invite</CardTitle>
          <CardDescription>
            You are signed in as {session.email}, but you are not a member of any
            organisation yet. Ask your administrator to send an invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} variant="outline">
            Back to login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
