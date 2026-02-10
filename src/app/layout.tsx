import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Noto_Sans_SC } from "next/font/google";

import "./globals.css";

const notoSans = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Stock Close Matrix",
  description: "Yahoo Finance powered stock close matrix with watchlist and daily updates",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSans.variable} ${ibmPlexMono.variable}`}>
        <div className="app-shell">
          <header className="app-header">
            <div>
              <h1>Stock Close Matrix</h1>
              <p>Yahoo Finance data source | Multi-symbol history | Daily auto-update</p>
            </div>
            <nav className="app-nav">
              <Link href="/">Home Matrix</Link>
              <Link href="/admin/watchlist">Watchlist Admin</Link>
            </nav>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}

