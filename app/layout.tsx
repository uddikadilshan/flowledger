import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeBootstrap } from "@/lib/theme";
import { FeedbackProvider } from "@/components/feedback";
import { Pwa } from "@/components/pwa";
export const metadata: Metadata = {
  title: "FlowLedger — Your business, in focus",
  description: "A clearer view of your businesses and their commitments.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FlowLedger",
    statusBarStyle: "default",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#112d32",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
        <Pwa />
      </body>
    </html>
  );
}
