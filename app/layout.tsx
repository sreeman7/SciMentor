import type { Metadata } from "next";
import "@/frontend/styles/globals.css";

export const metadata: Metadata = {
  title: "SciMentor | Your mentoring space",
  description: "Weekly availability, private conversations, and a little guidance for your science journey.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
