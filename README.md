# Keva Production Capacity Planner — Delilah LA

Production capacity planning tool for Hwood Group. Shows allocated batch capacity per recipe based on real inventory and depletion-weighted ingredient sharing.

**100 recipes · 335 ingredients · Delilah LA inventory**

---

## Deploy to GitHub Pages (Free, 5 minutes)

### Step 1 — Create a Private GitHub Repository

Go to https://github.com/new
- **Name:** `keva-capacity-planner`
- **Visibility:** Private
- Click **Create repository**

### Step 2 — Push This Code

Extract the zip, open PowerShell in the `keva-deploy` folder, and run:

```powershell
git init
git add .
git commit -m "Keva Capacity Planner v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/keva-capacity-planner.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Step 3 — Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar)
4. Under **Source**, select **GitHub Actions**
5. That's it — the workflow file included in this repo handles the rest

### Step 4 — Wait for Deploy

1. Click the **Actions** tab in your repo
2. You'll see a workflow running called "Deploy to GitHub Pages"
3. Wait ~2 minutes for it to finish (green checkmark)

### Step 5 — Share the URL

Your site is live at:

```
https://YOUR_USERNAME.github.io/keva-capacity-planner
```

Share this link with your manager. Works on any browser, any device, no login needed.

---

## Run Locally (Optional)

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## Notes

- All data is embedded in the app (no database)
- Edits reset on page refresh (demo mode)
- Future: connect to Supabase via KevaOS for persistent data
