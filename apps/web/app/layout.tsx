import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Karevia Studio",
  description: "Private video editing workspace",
  icons: { icon: "/icon.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
