# 在线股票历史收盘价查询网站

基于 `Next.js + Prisma + SQLite + Yahoo Finance` 的全栈应用，支持：

- 多股票代码历史查询（单次最多 20 个）
- 同时展示 `Close` 和 `Adj Close`
- 折线图 + 明细表格
- 后台维护每日自动更新清单
- `Asia/Shanghai` 时区下按 cron 每日更新

## 技术栈

- Next.js App Router + TypeScript
- Prisma ORM + SQLite
- Yahoo Finance 数据源：`yahoo-finance2`
- 图表：Apache ECharts
- 测试：Vitest + Playwright

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

3. 初始化数据库迁移

```bash
npm run prisma:deploy
```

4. 启动开发环境

```bash
npm run dev
```

启动后访问 `http://localhost:3000`。

## 环境变量

`.env.example` 中包含以下关键配置：

- `DATABASE_URL`: SQLite 地址，默认 `file:../data/app.db`
- `MAX_QUERY_SYMBOLS`: 单次查询股票代码上限（默认 20）
- `DEFAULT_WATCHLIST`: 启动时空清单的默认预置代码
- `UPDATE_API_TOKEN`: 内部更新 API 的令牌
- `TZ`: 推荐 `Asia/Shanghai`

## API 说明

1. `GET /api/prices`
- Query:
  - `symbols` 必填，支持逗号/空格/换行输入
  - `from` 可选，`YYYY-MM-DD`
  - `to` 可选，`YYYY-MM-DD`
- 返回：
  - `range: { from, to }`
  - `series: [{ symbol, currency, points: [{ date, close, adjClose }] }]`
  - `warnings: string[]`

2. `GET /api/admin/watchlist`
- 返回自动更新清单和最近成功更新时间

3. `POST /api/admin/watchlist`
- Body: `{ "symbol": "AAPL", "displayName": "Apple" }`

4. `DELETE /api/admin/watchlist/:symbol`
- 删除清单代码

5. `POST /api/internal/update-daily`
- 用于定时任务触发
- Header: `x-update-token: <UPDATE_API_TOKEN>`

## 每日自动更新（cron）

推荐每天 `08:30`（上海时区）执行：

```bash
APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token sh scripts/cron/run-daily-update.sh
```

Linux crontab 示例：

```cron
30 8 * * * TZ=Asia/Shanghai APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token /bin/sh /path/to/scripts/cron/run-daily-update.sh >> /var/log/stock_update.log 2>&1
```

Windows 可用：

```powershell
powershell -File scripts/cron/run-daily-update.ps1 -AppUrl "http://127.0.0.1:3000" -UpdateApiToken "your-token"
```

## Docker 部署

构建并启动：

```bash
docker compose up -d --build
```

应用端口默认 `3000`，SQLite 数据通过 `./data -> /app/data` 挂载持久化。

## 测试

- 单元 + 集成：

```bash
npm test
```

- E2E：

```bash
npm run test:e2e
```

