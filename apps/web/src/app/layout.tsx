import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Opportunity Engine — Command Center",
  description: "Unified bid management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans text-sm leading-relaxed">
        {children}
      </body>
    </html>
  );
}
