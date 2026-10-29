import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apotek",
  description: "Pharmacy POS and inventory",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// System fonts only, so the app works fully offline on a local install.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
