import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Halfday",
  description: "Plan your pub crawl around Norwich",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden">{children}</body>
    </html>
  );
}
