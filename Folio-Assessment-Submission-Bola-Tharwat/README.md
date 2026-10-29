# Folio — Collaborative Document Editor

> **Live Deployment**: [https://folio-document-editor.pages.dev](https://folio-document-editor.pages.dev)  
> **Source Repository**: [https://github.com/bolatharwatmee/folio-document-editor](https://github.com/bolatharwatmee/folio-document-editor)

Folio is a small, deliberate collaborative document editor built as a Full Stack Product Engineer take-home assignment. Inspired by the core writing and sharing flows of Google Docs, Folio implements a focused, reliable end-to-end slice: rich-text formatting, explicit revision-checked saving, owner-controlled document sharing, UTF-8 `.txt` file import, document export (Markdown, Text, Print/PDF), real-time search, and persistent storage backed by SQLite (and Cloudflare D1 in live deployment).

---

## Quick Start

### Prerequisites

- **Node.js**: `>= 24.0.0` (uses native `node:sqlite` DatabaseSync)
- **npm**: `>= 10.0.0`

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Default contents of `.env.example`:
```ini
# Local API server port
PORT=3000

# SQLite database file (in production, ensure this is on a durable persistent volume)
DATABASE_PATH=./data/folio.db

# Set to the public origin in production, e.g. https://folio.example.com
# Used for cross-origin write protection. Leave blank locally.
APP_ORIGIN=

# Set false for local production testing over HTTP. Defaults to true when NODE_ENV=production.
COOKIE_SECURE=
```

### 3. Database Migration & Demo Seed

Database migrations and initial synthetic seeds run automatically whenever the server starts. You can also run them explicitly:

```bash
npm run db:migrate
npm run seed
```

### 4. Running the Application

#### Option A: Full Production Build & Run (Single Process)

```bash
# Build both TypeScript backend and Vite frontend
npm run build

# Start the unified server on http://localhost:3000
npm start
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

#### Option B: Local Development Mode (Hot Reload)

```bash
# Runs Express API on :3000 and Vite dev server on :5173 with proxy
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## Synthetic Reviewer Accounts

Folio uses server-enforced demo identity with HttpOnly session cookies. No external accounts, OAuth providers, or secret passwords are required.

When opening the app, select any of the three pre-seeded accounts:

| Demo Account | Name | Role in Demo | Purpose |
| :--- | :--- | :--- | :--- |
| **`usr_alice`** | Alice Nguyen | Owner Account | Pre-owns the *Welcome to Folio* document; can edit, share, and revoke access. |
| **`usr_bob`** | Bob Ortega | Shared Recipient | Pre-owns *Launch notes*; has shared recipient access to Alice's *Welcome* document. |
| **`usr_carol`** | Carol Sato | Unrelated Reviewer | Pre-owns *Carol's private memo*; has zero access to Alice or Bob's unshared work. |

You can switch demo accounts at any time from the account menu in the navigation bar.

> [!NOTE]
> The demo selector is an intentional testing mechanism for reviewer evaluation. Authentication state is stored in an encrypted session table on the server and verified on every API request. Client-side state is never trusted for authorization.

---

## Core Product Capabilities

### 1. Document Creation & Editing
- **Create & Rename**: Create blank documents or rename existing drafts with inline title editing (auto-saved on blur or Enter).
- **Rich-Text Formatting**:
  - Headings (Normal text, Heading 1, Heading 2, Heading 3)
  - Bold (`Cmd/Ctrl+B`), Italic (`Cmd/Ctrl+I`), Underline (`Cmd/Ctrl+U`)
  - Bulleted lists and numbered lists
  - Undo (`Cmd/Ctrl+Z`) and Redo (`Cmd/Ctrl+Shift+Z`)
- **Sanitized Rich-Text Schema**: Structured Tiptap/ProseMirror document JSON validated and sanitized on the server. Script tags, arbitrary HTML, and dangerous URI schemes are rejected.

### 2. Explicit Saving & Concurrency
- **Explicit Save**: Press **Save** or use the shortcut `Cmd/Ctrl+S`.
- **Truthful Status**: The editor only displays **"Saved"** after the server acknowledges durable persistence.
- **Revision Tracking**: Every save sends a `baseRevision`. If another collaborator saves first, the server rejects the stale update with `409 Conflict`.
- **Conflict UX**: When a conflict occurs, the user is never silently overwritten. They can:
  1. **Save as Copy**: Save their current modifications as a new document (`"Title (my copy)"`).
  2. **Reload Latest**: Inspect and reload the latest version from the server.
- **Unsaved Changes Protection**: Warns the user via `beforeunload` and navigation guards before discarding unsaved work. Local drafts are backed up to browser storage as a recovery aid.

### 3. File Import & Document Export
- **File Import**: Plain text (`.txt`), decoded strictly as UTF-8 up to 200 KB. Importing creates a new document with clean paragraph nodes preserving lines without damaging existing drafts.
- **Document Export**:
  - **Markdown (.md)**: Converts the rich-text AST to formatted Markdown and triggers browser download.
  - **Plain Text (.txt)**: Downloads the plain text representation.
  - **Print / Save as PDF**: Formatted `@media print` layout hiding chrome and toolbars for clean PDF saving.

### 4. User-to-User Sharing & Server Authorization
- **Ownership**: The user who creates an imported document or new draft is the sole owner.
- **Owner-Only Sharing**: Only the owner can invite collaborators or revoke access.
- **Roles**:
  - **Owner**: Full read, write, rename, share management, and deletion access.
  - **Shared Editor (`role: editor`)**: Read, write, and rename access. Cannot share with others or revoke shares.
  - **Shared Viewer (`role: viewer`)**: Read-only access. Editor UI is disabled, toolbar displays view-only mode, and backend mutations are rejected with `403 Forbidden`.
  - **Unrelated User**: Returned `404 Not Found` across all endpoints (`GET`, `PATCH`, `POST /shares`, `GET /shares`). Document existence and content are completely hidden.
- **Dynamic Role Management**: Owners can switch collaborators between Editor and Viewer in real time.
- **UI Distinction**: The dashboard visually segregates documents into **"My documents"** and **"Shared with me"**, displaying owner avatars, role badges (*Shared* vs *View only*), and collaborator counts.

### 5. Document Search & Dashboard Filtering
- **Real-Time Search**: Search input on the dashboard filters documents in real time across title, document snippet/content, and author name with match count indicators.

### 6. Persistence
- **Storage**: Powered by SQLite using Node's native synchronous driver with WAL mode (`PRAGMA journal_mode = WAL`) and foreign keys enforced.
- **Durability**: Documents, revisions, shares, and session tokens survive server reboots and process restarts.

---

## Automated Testing & Quality Checks

Run the verification suite:

```bash
# Typecheck TypeScript (client, server, and test configs)
npm run typecheck

# Run automated integration tests with Vitest & Supertest
npm test

# Run production build (TypeScript compilation & Vite bundle)
npm run build

# Run complete verification chain
npm run verify
```

### Test Coverage Summary
- **Session & Health**: Health endpoint, session creation with HttpOnly cookie, sign out.
- **Documents & Formatting**: Full CRUD lifecycle, formatting preservation across save & reopen, stale save conflict rejection, content sanitization against malicious markup, repeatable seed idempotency.
- **Sharing & Authorization**: Share granting, recipient editing, author attribution, prohibition of shared editors inviting third parties (403), complete isolation of unrelated users (404), self-share and unknown user rejection.
- **Text Import**: Valid `.txt` import, rejection of unsupported types (`.md`), rejection of empty, oversized, and binary inputs.
- **Persistence & Security**: Database restart verification across process lifecycles, CSRF / Sec-Fetch-Site origin verification.

---

## Free Cloud Deployment

Complete step-by-step instructions for deploying to **Render.com** (Free Web Service) or **Fly.io** (with persistent volume) are provided in [`DEPLOYMENT.md`](file:///Users/marina/TextEditor/DEPLOYMENT.md). Pre-configured files include:
- `render.yaml` (Render Blueprint for 1-click deployment)
- `fly.toml` (Fly.io volume config)
- `Dockerfile` (Multi-stage Node 24 production container)

---

## Troubleshooting

- **`Port 3000 already in use`**: Specify a different port: `PORT=3210 npm start`.
- **Cookie not set on localhost**: If running in production mode (`NODE_ENV=production`) over plain HTTP localhost, set `COOKIE_SECURE=false` in `.env`.
- **Database reset**: To reset demo state to clean defaults, delete `data/folio.db*` and restart the server; migrations and seed data will recreate automatically.
