import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinia | Voice Benchmark",
  description: "A focused dashboard for the Infinia multilingual voice benchmark.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
