import { VehicleCaptureScreen } from "@/features/vehicles/components/vehicle-capture-screen";

type PageProps = { params: Promise<{ id: string }> };

export default async function VehicleEditCapturePage({ params }: PageProps) {
  const { id } = await params;
  return <VehicleCaptureScreen vehicleId={id} />;
}
