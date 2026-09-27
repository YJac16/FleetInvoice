import { DriverCaptureScreen } from "@/features/drivers/components/driver-capture-screen";

type PageProps = { params: Promise<{ id: string }> };

export default async function DriverEditCapturePage({ params }: PageProps) {
  const { id } = await params;
  return <DriverCaptureScreen driverId={id} />;
}
