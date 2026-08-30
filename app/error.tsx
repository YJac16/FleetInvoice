"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="font-heading text-2xl tracking-tight">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
