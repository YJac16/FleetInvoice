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
    "GoOps — operations platform for transport operators to manage jobs, trips, vehicles, invoices and payments.",
  manifest: "/manifest.webmanifest",
  applicationName: APP_NAME,
  icons: {
    icon: [
      { url: "/brand/goops-favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/apple-touch-icon-180x180.png", sizes: "180x180", type: "image/png" },
      { url: "/brand/goops-apple-touch.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B1F3B" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1F3B" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/brand/goops-favicon.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon-180x180.png"
        />
        <link rel="apple-touch-icon" href="/brand/goops-apple-touch.png" />
      </head>
      <body
        className={`${sans.variable} ${mono.variable} ${heading.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
