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
  title: "股票历史收盘价矩阵",
  description: "基于 Yahoo Finance 的股票历史收盘价矩阵，支持自选清单与每日自动更新",
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
              <h1>股票历史收盘价矩阵</h1>
              <p>Yahoo Finance 数据源 | 多股票历史收盘价 | 每日自动更新</p>
            </div>
            <nav className="app-nav">
              <Link href="/">首页矩阵</Link>
              <Link href="/admin/watchlist">自选清单管理</Link>
            </nav>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
