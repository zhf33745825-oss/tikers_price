# 股票历史收盘价矩阵

基于 Next.js + Prisma + SQLite + Yahoo Finance 的股票历史数据应用，支持首页矩阵展示、自选清单管理和每日自动更新。

## 本机运行（优先看这里）

1. 安装依赖

```bash
npm install
```

2. 创建环境变量文件

Linux / macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. 执行数据库迁移

```bash
npm run prisma:deploy
```

4. 启动开发环境

```bash
npm run dev
```

浏览器访问：`http://localhost:3000`

## 功能说明

- 首页矩阵表格：
  - 列结构：`代码 -> 名称 -> 地区 -> 币种 -> 各交易日收盘价`
  - 支持 `7天 / 30天 / 90天 / 自定义区间`
  - 按交易日并集展示，缺失值显示为 `N/A`
  - 表头固定 + 前 4 列固定
  - 宽表横向虚拟渲染
- 自选清单驱动默认展示，支持手动排序
- 名称/地区覆盖（管理员页面）
- 高级查询面板（临时代码 + 图表/明细）
- 每日更新接口（供定时任务调用）
- DB 优先读取 + 缺失异步补抓（补抓期间可自动刷新）

## 技术栈

- Next.js App Router + TypeScript
- Prisma + SQLite
- Yahoo Finance 数据源
- ECharts 图表
- Vitest + Playwright

## 环境变量

请参考 `.env.example`：

- `DATABASE_URL`：默认 `file:./data/app.db`
- `MAX_QUERY_SYMBOLS`：默认 `20`
- `DEFAULT_WATCHLIST`：默认自选代码
- `UPDATE_API_TOKEN`：内部更新接口鉴权 token
- `TZ`：建议 `Asia/Shanghai`

## API 接口

1. `GET /api/prices`
- 历史序列接口（用于图表面板）。

2. `GET /api/prices/matrix`
- Query 参数：
  - `mode=watchlist|adhoc`（默认 `watchlist`）
  - `preset=7|30|90|custom`（默认 `30`）
  - `from` / `to`：当 `preset=custom` 时必填
  - `symbols`：当 `mode=adhoc` 时必填
- 返回字段：
  - `dates`
  - `displayDates`
  - `rows`
  - `warnings`
  - `range`

3. `GET /api/admin/watchlist`
- 获取自选清单（含排序、覆盖值、自动识别字段）。

4. `POST /api/admin/watchlist`
- 请求体示例：

```json
{ "symbol": "AAPL", "displayName": "Apple", "regionOverride": "US" }
```

5. `PATCH /api/admin/watchlist/:symbol`
- 更新名称/地区覆盖值。

6. `DELETE /api/admin/watchlist/:symbol`
- 删除自选代码。

7. `POST /api/admin/watchlist/reorder`
- 请求体示例：

```json
{ "symbol": "AAPL", "direction": "up" }
```

8. `POST /api/internal/update-daily`
- 触发每日更新任务。
- Header：`x-update-token: <UPDATE_API_TOKEN>`

## 每日定时任务

示例（上海时区每天 08:30）：

```bash
APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token sh scripts/cron/run-daily-update.sh
```

Crontab 示例：

```cron
30 8 * * * TZ=Asia/Shanghai APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token /bin/sh /path/to/scripts/cron/run-daily-update.sh >> /var/log/stock_update.log 2>&1
```

## Docker 部署

```bash
docker compose up -d --build
```

数据持久化映射：`./data -> /app/data`

## 国内服务器（阿里云）注意事项

- 数据库默认使用项目内路径：`DATABASE_URL=file:./data/app.db`
- 字体已改为本地系统字体栈，不依赖 Google Fonts 外网拉取
- 若服务器网络对 Yahoo 有限制，建议配合代理或定时补抓策略

## 测试

```bash
npm test
npm run test:e2e
```
