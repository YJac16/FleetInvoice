"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/services/auth.service";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="font-heading text-2xl tracking-tight">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
