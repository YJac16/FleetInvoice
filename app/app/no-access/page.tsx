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
import { noAccessHomeHref } from "@/lib/auth/hub-redirect";
import { isHubNotEntitled } from "@/lib/auth/module-guard";
import { requireSession } from "@/lib/auth/require-permission";

import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "No access",
};

/**
 * Shown when the active organisation's plan doesn't include a module.
 * Lives outside every guarded route group so it can't redirect to itself.
 */
export default async function NoAccessPage() {
  const session = await requireSession();
  const homeHref = noAccessHomeHref(session, !(await isHubNotEntitled(session)));
  const orgName =
    session.memberships.find((m) => m.organisation_id === session.activeOrganisationId)
      ?.organisations?.name ?? "this organisation";

  return (
    <div className="flex min-h-screen items-center justify-center bg-auth-surface-simple px-6 pb-40">
      <div className="w-full max-w-md space-y-6">
        <GoOpsLogo size="lg" showTagline />
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle className="font-heading text-3xl">Not on your plan</CardTitle>
            <CardDescription>
              This feature isn&apos;t included in {orgName}&apos;s plan. Ask your
              organisation admin if you need it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {homeHref ? (
              <Button render={<Link href={homeHref} />}>Back to home</Button>
            ) : null}
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
