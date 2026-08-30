import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/shared/providers";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const heading = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "WorkOps — enterprise workforce operations platform for multi-tenant organisations.",
  manifest: "/manifest.webmanifest",
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${mono.variable} ${heading.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
