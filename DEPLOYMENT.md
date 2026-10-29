# Folio — Free Deployment Guide

This guide walks you through deploying Folio to a free hosting service.

---

## Recommended Free Choice: Render.com (Web Service)

**Render** provides a completely free Web Service tier (750 free hours/month) that can build and run Folio as a unified Node.js service (Express API + built React frontend + SQLite).

### Step-by-Step Deployment on Render (Takes ~3 minutes):

1. **Push your code to GitHub / GitLab**:
   - Create a new repository (public or private) on GitHub.
   - Initialize git in your project directory (if not already done) and push:
     ```bash
     git init
     git add .
     git commit -m "Initial commit of Folio document editor"
     git branch -M main
     git remote add origin https://github.com/<your-username>/<your-repo-name>.git
     git push -u origin main
     ```

2. **Sign up or Log in to [Render.com](https://render.com)**:
   - Click **New +** in the top right and select **Web Service**.
   - Connect your GitHub repository.

3. **Configure the Service Settings**:
   - **Name**: `folio-document-editor` (or any name you prefer)
   - **Region**: Choose any (e.g., Oregon or Frankfurt)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Select **Free**

4. **Environment Variables** (under Advanced):
   - Add `NODE_ENV` = `production`
   - Add `COOKIE_SECURE` = `true`
   - Add `DATABASE_PATH` = `./data/folio.db`

5. **Deploy**:
   - Click **Deploy Web Service**.
   - Render will run `npm install`, build both the server and client, and start the app.
   - Once the deploy completes, Render will provide a free HTTPS URL:
     `https://folio-document-editor.onrender.com`

6. **Update Submission**:
   - Paste the live URL into `LIVE_URL.txt` and `README.md`.

---

## Alternative Choice with Persistent Volume: Fly.io

If you want the SQLite database to survive even when machines stop or restart, Fly.io provides persistent volume mounting.

### Steps on Fly.io:
1. Install Fly CLI: `brew install flyctl`
2. Sign up / login: `fly auth login`
3. Launch app:
   ```bash
   fly launch --no-deploy
   ```
4. Create a 1 GB persistent volume for SQLite:
   ```bash
   fly volumes create folio_data --size 1
   ```
5. Deploy:
   ```bash
   fly deploy
   ```
6. Your app will be live at `https://<your-app-name>.fly.dev`.

---

## What About Cloudflare Pages?

Cloudflare Pages is an excellent free host for static frontends. However, Folio relies on:
1. An Express API backend with session-managed HttpOnly cookies.
2. A relational SQLite database (`node:sqlite`).

Cloudflare Pages Functions runs on V8 Workers without a persistent disk filesystem (Cloudflare uses D1 instead of local SQLite files).

Therefore, **running the unified application on Render.com** is the simplest and cleanest path because:
- The single Express process already serves both the compiled React frontend from `dist/client` and the `/api/*` endpoints.
- No cross-origin CORS or third-party cookie configuration is needed.
- Everything runs on a single free HTTPS domain.
