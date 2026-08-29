import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  hubHrefForSession,
  tripsHrefForRole,
} from "@/lib/auth/hub-redirect";
import { getSessionContext } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Page not found",
};

async function sessionOrNull() {
  try {
    return await getSessionContext();
  } catch {
    return null;
  }
}

export default async function NotFound() {
  const session = await sessionOrNull();
  const hubHref = hubHrefForSession(session);
  const tripsHref = tripsHrefForRole(
    session?.activeRole,
    session?.isPlatformOwner ?? false
  );

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card px-8 py-14 text-center shadow-none">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {APP_NAME}
        </p>
        <p
          aria-hidden
          className="mt-8 font-heading text-8xl leading-none tracking-tight text-muted-foreground/30"
        >
          404
        </p>
        <h1 className="mt-8 font-heading text-2xl tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-sm">This stop isn&apos;t on the route.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The URL may be wrong, or you don&apos;t have access.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button className="rounded-2xl px-4" render={<Link href={hubHref} />}>
            Go to hub
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl border-border/80 px-4"
            render={<Link href={tripsHref} />}
          >
            View trips
          </Button>
        </div>
      </div>
    </main>
  );
}
