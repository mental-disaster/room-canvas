import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Room Canvas",
  description: "Plan room layouts with shared canvas links.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
