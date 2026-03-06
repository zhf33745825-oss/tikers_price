import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "股票历史收盘价矩阵",
  description: "基于 Yahoo Finance 的多股票历史收盘价矩阵，支持自选清单与每日自动更新",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="app-shell">
          <header className="app-header">
            <div>
              <h1>股票历史收盘价矩阵</h1>
              <p>Yahoo Finance 数据源 | 多股票历史收盘价 | 每日自动更新</p>
            </div>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
