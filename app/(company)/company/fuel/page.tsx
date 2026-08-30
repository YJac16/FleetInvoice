import { FuelFillupsPage } from "@/features/fuel/components/fuel-fillups-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <FuelFillupsPage
      title="Fuel history"
      description="Fill-ups for vehicles attributed to your companies."
    />
  );
}
