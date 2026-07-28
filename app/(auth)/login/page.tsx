import { Suspense } from "react";

import { LoginForm } from "@/features/auth/components/login-form";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} />}>
      <LoginForm />
    </Suspense>
  );
}
