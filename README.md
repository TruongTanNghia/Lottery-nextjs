# Lottery Limit Manager — Next.js / Vercel

Next.js port of the Python FastAPI app. Deploys to Vercel with Turso (cloud SQLite)
for persistence and Vercel Cron Jobs for daily auto-scrape.

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Turso (libSQL, SQLite-compatible cloud DB)
- Cheerio for scraping
- Recharts for charts
- Tailwind CSS

## Architecture

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/
│       ├── limits/{route.ts, [lo]/route.ts}
│       ├── consecutive/route.ts
│       ├── results/{today,lo-daily}/route.ts
│       ├── stats/profit/{route.ts, chart/route.ts}
│       ├── scrape/{all,today,status}/route.ts
│       ├── predict/route.ts
│       ├── config/schedule/route.ts
│       ├── cron/{scrape-daily,cleanup}/route.ts
│       └── init-db/route.ts
├── components/
│   ├── Header, RegionTabs, StatsBar, LoGrid
│   ├── ScheduleEditor, ProfitChart
│   ├── LoDetailModal, PredictionPage
└── lib/
    ├── db.ts                 # Turso client + schema
    ├── limit-engine.ts       # Limit calc + schedule
    ├── profit-calculator.ts  # Thu/Bù/Lãi
    ├── prediction.ts         # 7-model ensemble
    ├── scraper.ts            # XSMN/XSMB/XSMT scrapers
    ├── api-utils.ts          # Auth, validation
    ├── format.ts             # VND, date helpers
    └── types.ts              # Shared types
```

See `DEPLOY.md` for deploy instructions.
