import type { Metadata } from "next";
import "./globals.css";

// og:image is resolved against this; without it Next falls back to
// localhost:3000 and link previews silently show nothing.
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kho Bạc — Quản Lý Hạn Mức",
  description: "Quản Lý Hạn Mức Lô 3 Miền — Miền Nam, Miền Bắc, Miền Trung",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  openGraph: {
    title: "Kho Bạc — Quản Lý Hạn Mức",
    description: "Bảng hạn mức 100 lô, 3 miền",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Archivo for stamped-metal headings, Be Vietnam Pro for body text
            (its diacritics are drawn for Vietnamese, not bolted on), JetBrains
            Mono for the tabular figures on the vault board. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
