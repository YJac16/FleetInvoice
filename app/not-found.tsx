import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
