import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mittendrin.in – Eintrag per Chat",
  description: "Prototyp: konversationeller Ersatz für das lange Eintragsformular",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
