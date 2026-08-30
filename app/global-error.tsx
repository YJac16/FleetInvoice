"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
        <h2 className="text-2xl font-semibold tracking-tight">WorkOps error</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {error.message || "A critical error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-foreground px-4 py-2 text-sm text-background"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
