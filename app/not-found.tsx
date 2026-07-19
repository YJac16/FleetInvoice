import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted shadow-sm">
        <FileQuestion className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you requested does not exist or was moved. Return to the
        dashboard to continue.
      </p>
      <Button className="mt-6" render={<Link href={ROUTES.dashboard} />}>
        Back to dashboard
      </Button>
    </div>
  );
}
