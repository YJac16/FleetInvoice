import { GoOpsLogo } from "@/components/brand/goops-logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-auth-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <div className="mb-10 space-y-2">
          <GoOpsLogo height={36} />
          <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
            {APP_TAGLINE}
          </p>
          <p className="sr-only">{APP_NAME}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
