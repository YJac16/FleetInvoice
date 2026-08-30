import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-auth-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <div className="mb-10">
          <p className="font-heading text-2xl tracking-tight">{APP_NAME}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Workforce operations for modern organisations
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
