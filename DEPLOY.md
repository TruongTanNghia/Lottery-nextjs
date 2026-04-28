# Deploy lên Vercel

App này dùng:
- **Vercel** — host Next.js
- **Turso** — SQLite-compatible cloud DB (free 500MB, 1B reads/tháng)
- **Vercel Cron Jobs** — auto scrape mỗi ngày 19:00 VN

## Prerequisites

1. Tài khoản GitHub (push code lên repo)
2. Tài khoản Vercel: https://vercel.com (đăng ký bằng GitHub)
3. Tài khoản Turso: https://turso.tech (đăng ký bằng GitHub)
4. Turso CLI: https://docs.turso.tech/cli/installation

```powershell
# Cài Turso CLI (Windows PowerShell)
iwr https://get.tur.so/install.ps1 | iex

# Hoặc dùng scoop
scoop install turso
```

---

## Bước 1 — Tạo Turso database

```powershell
turso auth signup        # Hoặc: turso auth login
turso db create lottery --location sin    # Singapore region
turso db show lottery --url               # Lưu URL: libsql://...
turso db tokens create lottery            # Lưu token: ey...
```

→ Bạn có 2 thứ:
- `TURSO_DATABASE_URL` = `libsql://lottery-USERNAME.turso.io`
- `TURSO_AUTH_TOKEN`   = `eyJhbGciOi...` (token rất dài)

---

## Bước 2 — Local test (optional)

```powershell
cd e:\AI\project_earn_money\NCKH\lottery-nextjs
npm install

# Tạo .env.local
copy .env.example .env.local
# Sửa .env.local, paste TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, CRON_SECRET (random string)

npm run dev
# Mở http://localhost:3000
```

Test API trực tiếp:
```powershell
curl.exe http://localhost:3000/api/limits?region=xsmn
```

---

## Bước 3 — Push lên GitHub

```powershell
cd e:\AI\project_earn_money\NCKH\lottery-nextjs
git init
git add -A
git commit -m "initial: lottery nextjs port"
git branch -M main
# Tạo repo mới trên GitHub (UI), rồi:
git remote add origin https://github.com/USERNAME/lottery-nextjs.git
git push -u origin main
```

---

## Bước 4 — Deploy trên Vercel

1. Mở https://vercel.com/new
2. **Import Git Repository** → chọn repo `lottery-nextjs`
3. **Framework Preset**: Next.js (auto-detect)
4. **Environment Variables** — thêm 4 biến:

| Key | Value |
|-----|-------|
| `TURSO_DATABASE_URL` | `libsql://lottery-USERNAME.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJhbGc...` (token Turso) |
| `CRON_SECRET` | random string (vd `openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | `https://lottery-nextjs.vercel.app` (URL Vercel cho bạn) |

5. **Deploy** → đợi ~2 phút build

---

## Bước 5 — Init DB + scrape data lần đầu

Sau deploy xong, Vercel cho URL: `https://lottery-nextjs-USERNAME.vercel.app`

### A. Init DB (tạo bảng + seed lo_status)

```powershell
$URL = "https://lottery-nextjs-USERNAME.vercel.app"
$SECRET = "your-cron-secret-from-step-4"

curl.exe -X POST "$URL/api/init-db" -H "Authorization: Bearer $SECRET"
```

→ Mong đợi: `{"status":"success","message":"DB initialized + seeded"}`

### B. Scrape 5 ngày data đầu tiên

```powershell
curl.exe -X POST "$URL/api/scrape/all?days=5"
```

(Vercel Hobby tier giới hạn 60s/request → mỗi lần chỉ scrape được ~5 ngày × 3 miền)

Lặp lại để có thêm data:
```powershell
# Sau khi data 5 ngày đầu xong, đợi 1 phút rồi scrape thêm:
curl.exe -X POST "$URL/api/scrape/all?days=5"
```

Hoặc đơn giản hơn: mở `$URL` trong browser → click 🔄 Cập nhật.

---

## Bước 6 — Verify Cron + auto-scrape

Vercel Cron đã được config trong `vercel.json`:
- **Daily scrape**: `0 12 * * *` (12:00 UTC = 19:00 VN)
- **Weekly cleanup**: `0 20 * * 0` (Sun 20:00 UTC = Mon 03:00 VN)

⚠️ **Quan trọng**: Vercel Cron chỉ chạy trên **Production deployment** (không chạy trên Preview).

Check cron đã được register:
1. Vercel dashboard → Project → **Settings** → **Cron Jobs**
2. Thấy 2 jobs với schedule

Trigger manual để test:
```powershell
curl.exe "$URL/api/cron/scrape-daily" -H "Authorization: Bearer $SECRET"
```

---

## Vận hành hằng ngày

✅ Không cần làm gì.

- 19:00 VN mỗi ngày: Vercel cron tự gọi `/api/cron/scrape-daily` → scrape 3 miền + recalc
- Mở app lúc nào cũng thấy data fresh

---

## Update code

```powershell
git add -A
git commit -m "update: ..."
git push
```

→ Vercel auto-deploy. Done.

---

## Troubleshooting

### "TURSO_DATABASE_URL env var is required"
→ Chưa set env vars trên Vercel. Vercel dashboard → Settings → Environment Variables.

### Cron không chạy
- Vercel Hobby plan: cron chỉ 1 lần/ngày, OK cho daily scrape
- Cron không chạy trên Preview branch — cần deploy lên Production
- Check logs: Vercel dashboard → Project → Logs (filter `/api/cron/`)

### Scrape timeout
- Vercel Hobby: 60s timeout. Scrape 5 ngày × 3 miền ≈ 22s, OK.
- Nếu cần backfill 30 ngày: gọi `/api/scrape/all?days=5` nhiều lần (mỗi lần thêm 5 ngày)

### DB chưa init
```powershell
curl.exe -X POST "$URL/api/init-db" -H "Authorization: Bearer $SECRET"
```

### Turso quota
- Free tier: 500MB storage + 1B row reads/tháng + 25M row writes/tháng
- App này dùng < 50MB cho 30 ngày data → an toàn lớn

---

## Pricing summary

| Service | Free tier | Đủ cho app này? |
|---------|-----------|-----------------|
| Vercel Hobby | 100GB bandwidth, 60s function timeout, 2 cron jobs | ✅ |
| Turso | 500MB DB, 1B reads/tháng, 25M writes/tháng | ✅ |

Tổng: **$0/tháng** trong free tier.
