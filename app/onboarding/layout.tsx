import { GoOpsLogo } from "@/components/brand/goops-logo";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-auth-surface-simple px-6 py-12">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <GoOpsLogo size="lg" showTagline />
        {children}
      </div>
    </div>
  );
}
