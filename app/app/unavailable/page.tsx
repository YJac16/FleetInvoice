import Link from "next/link";

import { GoOpsLogo } from "@/components/brand/goops-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { noAccessHomeHref } from "@/lib/auth/hub-redirect";
import { requireSession } from "@/lib/auth/require-permission";

import { SignOutButton } from "../no-access/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Temporarily unavailable",
};

/**
 * Shown when a module guard can't check access because the service client is
 * missing (503). Lives outside every guarded route group so it can't redirect
 * to itself. The home link is withheld for roles whose hub is itself a gated
 * module (company manager, employee): isHubNotEntitled is false on 503, so we
 * pass hubEntitled=false and never link back into a guard that would bounce
 * the user here again.
 */
export default async function UnavailablePage() {
  const session = await requireSession();
  const homeHref = noAccessHomeHref(session, false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-auth-surface-simple px-6 pt-6 pb-32">
      <div className="w-full max-w-md space-y-6">
        <GoOpsLogo size="lg" showTagline />
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle className="font-heading text-3xl">Temporarily unavailable</CardTitle>
            <CardDescription>
              This part of GoOps is temporarily unavailable. Please try again shortly.
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
