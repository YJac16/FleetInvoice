import { Truck } from "lucide-react";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgb(37_99_235_/_0.12),_transparent_55%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] dark:bg-[radial-gradient(ellipse_at_top,_rgb(59_130_246_/_0.18),_transparent_55%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center lg:gap-16 lg:px-8">
        <div className="hidden max-w-md flex-1 animate-in fade-in slide-in-from-left-4 duration-500 lg:block">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Truck className="size-6" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            {APP_NAME}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {APP_DESCRIPTION}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-accent" />
              Role-based access for admins and drivers
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-accent" />
              Secure Supabase authentication
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-accent" />
              Built for weekly invoicing workflows
            </li>
          </ul>
        </div>

        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="size-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
