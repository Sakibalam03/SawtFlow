import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinia | Text to Audio",
  description: "A simple local text-to-audio interface for Infinia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
