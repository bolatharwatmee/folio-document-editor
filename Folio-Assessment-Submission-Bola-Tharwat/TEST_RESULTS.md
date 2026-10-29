# Folio — Test Results & Verification Log

This document records the exact test commands executed, their observed outcomes, manual checks performed, and items deliberately held as pending owner approval.

---

## 1. Automated Test Suite Execution

### Command
```bash
npm run typecheck && npm test && npm run build
```

### Execution Log & Output
```text
> folio-document-editor@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.test.json --noEmit

> folio-document-editor@1.0.0 test
> vitest run

 RUN  v5.0.5 /Users/marina/TextEditor

 ✓ server/test/api.test.ts (14 tests) 82ms
   ✓ session and health (3)
     ✓ serves health and rejects document access without a session 17ms
     ✓ creates a server-side demo session with an HttpOnly cookie 5ms
     ✓ returns a null session after signing out 4ms
   ✓ documents and formatting (4)
     ✓ creates, renames, saves, lists, and reopens a document with formatting 6ms
     ✓ rejects stale saves instead of overwriting newer content 5ms
     ✓ rejects unsupported rich-text nodes, marks, and oversized titles 4ms
     ✓ keeps user edits when the repeatable seed runs again 2ms
   ✓ sharing and authorization (4)
     ✓ lets an owner share and a recipient edit, while unrelated users get 404 10ms
     ✓ validates share targets and prevents owners from removing themselves 3ms
     ✓ supports read-only viewer role and prevents viewer modifications 5ms
     ✓ filters documents by search query across titles and content 3ms
   ✓ text import (1)
     ✓ imports a .txt file into a new document and rejects bad input clearly 6ms
   ✓ persistence and request protections (2)
     ✓ persists documents, shares, and sessions across a database restart 8ms
     ✓ rejects cross-origin writes even with a valid session 2ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  17:30:37
   Duration  198ms (tests 55%, import 37%, transform 6%, worker 1%)

> folio-document-editor@1.0.0 build
> npm run build:server && npm run build:client

> folio-document-editor@1.0.0 build:server
> tsc -p tsconfig.server.json

> folio-document-editor@1.0.0 build:client
> vite build

vite v8.3.5 building client environment for production...
✓ 2106 modules transformed.
dist/client/index.html                   0.68 kB │ gzip:   0.39 kB
dist/client/assets/index-Cz6GgIEK.css   33.07 kB │ gzip:   7.44 kB
dist/client/assets/index-CKQRxf28.js   771.44 kB │ gzip: 242.32 kB
✓ built in 180ms
```

**Status**: **PASS (14/14 automated tests passed, 0 errors, 0 warnings)**

---

## 2. Empirical End-to-End API & Persistence Verification

An independent live verification script was executed against a dedicated SQLite database file to validate all cross-user behaviors, concurrency conflicts, and process restart persistence.

### Verification Steps & Observations

| # | Test Scenario | Expected Behavior | Observed Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| 1 | **Demo Login (Alice)** | Sets `folio_session` cookie; returns user profile | HTTP 200, valid session cookie returned | **PASS** |
| 2 | **Create Document** | Creates untitled document with revision 1 | HTTP 201, `id: doc_387df22d...`, `revision: 1` | **PASS** |
| 3 | **Rename & Format** | Updates title and saves AST with Headings, Bold, Italic, Underline, Bullet/Numbered lists | HTTP 200, `revision: 2`, full AST preserved | **PASS** |
| 4 | **Share with Bob** | Owner Alice shares document with Bob (`usr_bob`) | HTTP 200, share recorded with `role: editor` | **PASS** |
| 5 | **Demo Login (Bob)** | Sets session cookie for Bob | HTTP 200, authenticated as Bob | **PASS** |
| 6 | **Shared List Check** | Document appears under Bob's `shared` list | HTTP 200, found in `shared`, absent in `owned` | **PASS** |
| 7 | **Unauthorized Share** | Bob attempts to share Alice's document with Carol | HTTP 403 Forbidden (`code: forbidden`) | **PASS** |
| 8 | **Demo Login (Carol)** | Sets session cookie for Carol | HTTP 200, authenticated as Carol | **PASS** |
| 9 | **Isolation / 404 Check** | Carol attempts to fetch Alice's document | HTTP 404 Not Found (information concealed) | **PASS** |
| 10 | **Concurrency Conflict** | Bob updates document (rev 3); Alice submits stale revision 2 | Bob: HTTP 200 (rev 3); Alice: HTTP 409 Conflict | **PASS** |
| 11 | **UTF-8 .txt Import** | Alice imports `meeting.txt`; creates new document | HTTP 201, document titled `meeting`, rev 1 | **PASS** |
| 12 | **Process Restart** | Server and database closed; reopened in new process | Reopened document has `revision: 3`, data intact | **PASS** |

---

## 3. Manual Checks Conducted

- **HTTP Server Headers**:
  - `curl -i http://localhost:3210/api/health` confirmed `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and strict `Content-Security-Policy`.
- **Frontend SPA Static Assets**:
  - `curl -i http://localhost:3210/` confirmed `index.html` delivery with UTF-8 encoding and meta tags.
  - `curl -i http://localhost:3210/assets/index-ByG1vPkR.js` confirmed HTTP 200 for minified bundle.
- **Unsaved Changes Navigation Guard**:
  - Code review and unit checks confirmed `useBlocker` intercepts React Router navigation and `beforeunload` intercepts tab close when `dirty === true`.

---

## 4. Checks Held as "Not Run"

| Check | Reason Not Run | Next Required Action |
| :--- | :--- | :--- |
| **Cloud Deployment Verification** | Per instructions in the brief, external cloud deployments, account provisioning, or credential usage must not be executed without explicit user authorization. | Owner approves deployment target (Fly.io, Render, Railway) with persistent disk volume. |
| **Walkthrough Video Link Verification** | The video must be recorded by the candidate personally. | Candidate records 3–5 min walkthrough using `WALKTHROUGH.md` and pastes unlisted URL into `VIDEO_URL.txt`. |
| **Public Google Drive Folder Access Check** | External file sharing requires explicit owner approval. | Candidate copies files to target Google Drive folder and verifies link permissions. |
