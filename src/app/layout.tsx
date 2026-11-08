import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnBrand — Evidence-led review",
  description: "Review draft content against your approved brand knowledge before it goes live.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
