import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym Equipment Congestion Grader",
  description: "Upload weekly gym equipment usage data",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
