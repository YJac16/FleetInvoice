import { Suspense } from "react";

import { SignUpForm } from "@/features/auth/components/signup-form";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={5} />}>
      <SignUpForm />
    </Suspense>
  );
}
