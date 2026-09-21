import { redirect } from "next/navigation";

import { CreateOrganisationForm } from "@/features/onboarding/components/create-organisation-form";
import { requireSession } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function CreateOrganisationOnboardingPage() {
  const session = await requireSession();

  if (session.isPlatformOwner || session.memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-2">
      <h1 className="font-heading text-3xl tracking-tight">Set up your workspace</h1>
      <p className="text-muted-foreground">
        Signed in as {session.email}. Create an organisation to manage drivers,
        trips, and invoices.
      </p>
      <CreateOrganisationForm
        defaultContactName={session.profile.full_name ?? ""}
        defaultContactEmail={session.email ?? ""}
      />
    </div>
  );
}
