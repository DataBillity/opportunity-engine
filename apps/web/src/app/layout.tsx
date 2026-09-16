import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "DataBillity | Opportunity Engine | Prospects, Partners & Projects",
  description: "Unified bid management platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans text-sm leading-relaxed antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
