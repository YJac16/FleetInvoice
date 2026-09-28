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

const description =
  "GoOps — operations platform for transport operators to manage jobs, trips, vehicles, invoices and payments.";

export const metadata: Metadata = {
  metadataBase: new URL("https://workops-mu.vercel.app"),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description,
  manifest: "/manifest.webmanifest",
  applicationName: APP_NAME,
  openGraph: {
    title: "GoOps",
    siteName: "GoOps",
    description,
    url: "/",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GoOps logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GoOps",
    description,
    images: ["/og-image.png"],
  },
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
      <body
        className={`${sans.variable} ${mono.variable} ${heading.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
