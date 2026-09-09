import { GoOpsLogo } from "@/components/brand/goops-logo";
import { APP_NAME, LOGIN_CAPABILITY_CHIPS } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-auth-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <div className="mb-10">
          <GoOpsLogo theme="dark" size="lg" showTagline />
          <p className="mt-3 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {LOGIN_CAPABILITY_CHIPS.map((chip, index) => (
              <span key={chip}>
                {index > 0 ? (
                  <span aria-hidden className="mx-1.5 opacity-40">
                    ·
                  </span>
                ) : null}
                {chip}
              </span>
            ))}
          </p>
          <p className="sr-only">{APP_NAME}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
