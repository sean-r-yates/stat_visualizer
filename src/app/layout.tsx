import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Round 5 Stat Visualizer",
  description: "Backtest-backed Round 5 product dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
