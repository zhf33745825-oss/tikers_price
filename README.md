# Stock Close Matrix

Next.js + Prisma + SQLite + Yahoo Finance application for stock history and daily updates.

## Features

- Home page matrix table:
  - `Code -> Name -> Region -> Ccy -> Daily Close columns`
  - 7D / 30D / 90D / custom range
  - Trade-day union columns, missing values shown as `N/A`
  - Sticky header + sticky first 4 columns
  - Wide-table horizontal virtual rendering
- Watchlist-driven default view with manual ordering
- Admin overrides for name and region
- Advanced panel for adhoc symbols and historical chart/table
- Daily auto-update endpoint for cron

## Tech Stack

- Next.js App Router + TypeScript
- Prisma + SQLite
- Yahoo Finance via `yahoo-finance2`
- ECharts for trend chart
- Vitest + Playwright

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Apply migrations:

```bash
npm run prisma:deploy
```

4. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

See `.env.example`:

- `DATABASE_URL` (default `file:../data/app.db`)
- `MAX_QUERY_SYMBOLS` (default `20`)
- `DEFAULT_WATCHLIST`
- `UPDATE_API_TOKEN`
- `TZ` (recommended `Asia/Shanghai`)

## API

1. `GET /api/prices`
- Legacy compatible historical series API (for chart panel).

2. `GET /api/prices/matrix`
- Query:
  - `mode=watchlist|adhoc` (default `watchlist`)
  - `preset=7|30|90|custom` (default `30`)
  - `from` / `to` required when `preset=custom`
  - `symbols` required when `mode=adhoc`
- Response includes:
  - `dates`
  - `displayDates`
  - `rows`
  - `warnings`
  - `range`

3. `GET /api/admin/watchlist`
- Returns watchlist with sort order, overrides, and resolved fields.

4. `POST /api/admin/watchlist`
- Body:
```json
{ "symbol": "AAPL", "displayName": "Apple", "regionOverride": "US" }
```

5. `PATCH /api/admin/watchlist/:symbol`
- Update name/region override.

6. `DELETE /api/admin/watchlist/:symbol`
- Remove symbol from watchlist.

7. `POST /api/admin/watchlist/reorder`
- Body:
```json
{ "symbol": "AAPL", "direction": "up" }
```

8. `POST /api/internal/update-daily`
- Trigger daily refresh job.
- Header: `x-update-token: <UPDATE_API_TOKEN>`

## Daily Cron

Example (`08:30 Asia/Shanghai`):

```bash
APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token sh scripts/cron/run-daily-update.sh
```

Crontab:

```cron
30 8 * * * TZ=Asia/Shanghai APP_URL=http://127.0.0.1:3000 UPDATE_API_TOKEN=your-token /bin/sh /path/to/scripts/cron/run-daily-update.sh >> /var/log/stock_update.log 2>&1
```

## Docker

```bash
docker compose up -d --build
```

SQLite persistence: `./data -> /app/data`.

## Tests

```bash
npm test
npm run test:e2e
```

