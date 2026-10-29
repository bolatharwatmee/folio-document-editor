# AI Workflow & Collaboration Log

This note honestly records how AI tools were used during the development of Folio, where they accelerated execution, what decisions were made, and which verifications were conducted.

---

## 1. AI Tools Used

1. **OpenCode (DeepSeek 4.1 Flash / GLM-5.3 Flash)**:
   - Used during the initial phases (scaffolding, schema design, backend Express routing, Tiptap editor integration, CSS styling, and the Vitest test suite).
   - Execution stopped when OpenCode hit its free provider usage limit (HTTP 429) during browser walkthrough preparation.
2. **Google Antigravity (Gemini 3.8 Flash)**:
   - Used to resume the session directly from the OpenCode session database (`opencode.db`).
   - Inspected the repository state, diagnosed the stoppage, executed rigorous automated and empirical integration tests, verified the production server and asset pipeline, and authored the delivery documentation and packaging.

---

## 2. Where AI Materially Accelerated Work

- **Boilerplate & Typed Schemas**: Quickly scaffolded synchronized TypeScript interfaces between the Express API and React frontend (`DocumentDetail`, `DocumentSummary`, `ShareEntry`, `RichTextDoc`).
- **Tiptap / ProseMirror Configuration**: Rapidly configured `@tiptap/starter-kit` with allowlisted formatting extensions (Headings 1-3, Bold, Italic, Underline, Bulleted List, Numbered List).
- **Relational Schema & Migrations**: Generated the SQLite migration scripts (`users`, `sessions`, `documents`, `document_shares`) with strict constraints and indices.
- **Integration Test Scaffolding**: Built a 12-test integration suite covering sessions, permissions, concurrency, text import, and database restart persistence in minutes.

---

## 3. Human & Engineering Decisions (What was Directed or Corrected)

1. **Zero Native Build Dependencies for SQLite**:
   - *Decision*: Rather than relying on `better-sqlite3` (which requires node-gyp, python, and C++ compilers that often fail across different Node.js environments and Docker architectures), the project was directed to use Node 24’s native built-in `node:sqlite` (`DatabaseSync`).
   - *Impact*: Flawless, instant installation with zero compilation overhead on macOS, Linux, and container targets.
2. **Rejection of Silent Autosave in Favor of Revision-Checked Explicit Saves**:
   - *Decision*: A naive autosave approach with last-write-wins was rejected. The system was explicitly designed with a `revision` counter on each document. Stale updates return `409 Conflict`, prompting the user with non-destructive options ("Save as Copy" or "Reload Latest").
3. **Information Hiding Security Rule (404 for Unrelated Users)**:
   - *Decision*: Rejecting an unauthorized user with `403 Forbidden` reveals that a document ID exists. The server was specifically instructed to return `404 Not Found` for unauthorized read, edit, share, or delete operations, completely concealing document existence from unauthorized accounts.
4. **AST Allowlist over HTML Sanitization**:
   - *Decision*: Instead of accepting arbitrary HTML and attempting to sanitize it with regex or DOMPurify, the server accepts only ProseMirror JSON AST. A recursive sanitizer (`server/src/content.ts`) validates every node against an allowlist, rejecting unknown node types or attribute payloads before writing to the database.

---

## 4. Correctness, UX & Reliability Checks Performed

- **TypeScript Compilation**: Executed `tsc` across client, server, and test configs (`npm run typecheck`) with zero errors.
- **Vitest Integration Suite**: Executed 12 automated test cases (`npm test`) using `supertest` verifying session lifecycles, permissions, stale saves, and schema enforcement.
- **Empirical Server Verification**: Wrote and executed an independent Node.js script testing 12 live API scenarios against a real SQLite database file, including cross-user sharing, 403 enforcement, 404 isolation, 409 concurrency conflict, text import, and data survival across an actual server shutdown and reboot.
- **Production Bundle & Assets**: Built the client with Vite (`npm run build`), served it via the unified Express server, and verified HTTP 200 responses for root HTML, assets, and `/api/health`.

---

## 5. Assumptions Requiring Owner Review

1. **Deployment Platform**: The implementation is configured for any container or VPS platform supporting persistent disk volumes (Fly.io, Render, Railway, AWS ECS). Per prompt instructions, external deployment has not been executed and awaits explicit owner approval.
2. **Walkthrough Recording**: The 3–5 minute walkthrough video must be recorded by the candidate using the prepared script in `WALKTHROUGH.md`.
3. **Google Drive Submission**: The prepared source archive should be copied to the candidate's Google Drive folder once authorization and reviewer email permissions are confirmed.
