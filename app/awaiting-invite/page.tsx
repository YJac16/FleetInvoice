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
import { GoOpsLogo } from "@/components/brand/goops-logo";
import { requireSession } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function AwaitingInvitePage() {
  const session = await requireSession();

  if (session.isPlatformOwner || session.memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-auth-surface-simple px-6">
      <div className="w-full max-w-md space-y-6">
        <GoOpsLogo theme="dark" size="lg" showTagline />
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
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
    </div>
  );
}
