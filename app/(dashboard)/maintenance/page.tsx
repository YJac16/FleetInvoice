import { redirect } from "next/navigation";

/** /maintenance (the nav link) opens the workshop bills list. */
export default function MaintenancePage() {
  redirect("/maintenance/bills");
}
