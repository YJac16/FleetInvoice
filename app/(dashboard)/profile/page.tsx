import { redirect } from "next/navigation";

import { ProfilePage } from "@/features/profile/components/profile-page";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const role = session.activeRole;
  if (role === "employee") {
    redirect("/employee/profile");
  }
  if (role === "driver") {
    redirect("/driver/profile");
  }

  return <ProfilePage variant="ops" />;
}
