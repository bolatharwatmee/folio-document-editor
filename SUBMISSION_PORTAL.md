# Folio — Collaborative Document Editor
### Full Stack Product Engineer Assignment Submission
**Candidate**: Bola Tharwat (`bolatharwatmee@gmail.com`)  
**Live Deployed Application**: [https://folio-document-editor.pages.dev](https://folio-document-editor.pages.dev)  
**GitHub Repository**: [https://github.com/bolatharwatmee/folio-document-editor](https://github.com/bolatharwatmee/folio-document-editor)  

---

## 1. Quick Reviewer Links & Access

| Resource | Link / Instructions |
| :--- | :--- |
| **Live Product URL** | **[https://folio-document-editor.pages.dev](https://folio-document-editor.pages.dev)** |
| **GitHub Repository** | **[https://github.com/bolatharwatmee/folio-document-editor](https://github.com/bolatharwatmee/folio-document-editor)** |
| **Submission Archive** | Source tarball packaged at `dist-package/folio-source.tar.gz` |
| **Walkthrough Script** | [`WALKTHROUGH.md`](https://github.com/bolatharwatmee/folio-document-editor/blob/main/WALKTHROUGH.md) |

### Reviewer Credentials & Test Accounts
No registration, passwords, or external auth required. Folio includes an instant demo switcher with three pre-seeded accounts:
- **`usr_alice` (Alice Nguyen - Owner)**: Pre-owns *Welcome to Folio*; has full owner rights to create, edit, share, and revoke access.
- **`usr_bob` (Bob Ortega - Collaborator)**: Receives shared documents; can edit documents shared with him with `editor` permissions.
- **`usr_carol` (Carol Sato - Unrelated Reviewer)**: Has zero access to Alice or Bob's unshared documents; ideal for verifying strict multi-tenant access control and 404/403 security boundaries.

*To switch accounts*: Click the user avatar badge in the top-right corner of the application at any time.

---

## 2. Requirement-by-Requirement Implementation Matrix

| Mandatory Requirement | Status | Architecture & Implementation Details |
| :--- | :---: | :--- |
| **1. Document Creation & Editing** | **Complete** | - Create blank documents via `POST /api/documents`.<br>- In-place inline title renaming with automatic blur/enter save.<br>- Rich-text editing powered by ProseMirror AST: Bold (`Ctrl+B`), Italic (`Ctrl+I`), Underline (`Ctrl+U`), Headings (H1, H2, H3), Bulleted Lists, and Numbered Lists.<br>- Rich text structure and formatting survive save, page refresh, and server restarts.<br>- Explicit saving with keyboard shortcut (`Cmd/Ctrl+S`). |
| **2. File Upload / Import** | **Complete** | - Plain text (`.txt`) import via dashboard and editor (`POST /api/import`).<br>- Strict UTF-8 validation rejecting non-UTF-8 and binary payloads.<br>- Enforced 200 KB size limit with human-readable error messages.<br>- Filename path-traversal sanitization. |
| **3. User-to-User Sharing** | **Complete** | - Document ownership tracked via relational `owner_id` foreign key.<br>- Granular role-based sharing: `editor` (can edit) and `viewer` (read-only).<br>- Only document owners can manage shares; non-owners get `403 Forbidden`.<br>- Dashboard distinctly separates *My documents* vs. *Shared with me* with collaborator badges.<br>- Strict isolation: Unshared documents return `404 Not Found` to non-collaborators, preventing information disclosure. |
| **4. Persistence & Concurrency** | **Complete** | - Local: Node 24 native `node:sqlite` in WAL mode with relational schema and foreign keys.<br>- Live Deployment: Cloudflare D1 serverless SQLite database with edge bindings.<br>- Optimistic concurrency control: each save passes `revision`; concurrent stale writes receive `409 Conflict`.<br>- Non-destructive conflict UI: allows user to "Save as Copy" or "Reload Latest".<br>- LocalStorage draft backup protects against unexpected network loss. |
| **5. Product & Engineering Quality** | **Complete** | - Full TypeScript strict typing end-to-end.<br>- Zod schema validation on all inputs.<br>- Recursive ProseMirror AST tree walker sanitizing and validating content against an allowlist.<br>- Security headers: strict Content Security Policy (CSP), Frameguard, and CSRF / Sec-Fetch-Site origin verification.<br>- **14/14 automated Vitest integration tests passing** with 0 failures.<br>- Idempotent demo database seeder preserving existing work. |
| **6. Live Deployment** | **Complete** | Deployed live to Cloudflare Pages ([https://folio-document-editor.pages.dev](https://folio-document-editor.pages.dev)) backed by Cloudflare D1 serverless SQLite. Verified live authentication, document listing, creation, editing, and 409 stale conflict rejection. |

---

## 3. High-Leverage Stretch Features Implemented

Beyond the core prompt requirements, the following production enhancements were completed:
1. **Document Export**:
   - High-fidelity export to **Markdown (`.md`)** with headings, bold, italic, underline, and lists.
   - Clean export to **Plain Text (`.txt`)**.
   - **Print-to-PDF**: Dedicated `@media print` layout stylesheet hiding navigation chrome and toolbar for clean PDF generation via `window.print()`.
2. **Read-Only Viewer Role**:
   - Added `role: 'editor' | 'viewer'` to database schema.
   - Enforced at both UI layer (editor becomes read-only with "View only" badge) and API layer (`403 Forbidden` returned on update attempts).
3. **Real-Time Document Search**:
   - Instant multi-field search filter on the dashboard querying document titles, body snippets, and owner names.
   - Live match counts and quick-clear shortcut.

---

## 4. Local Setup and Run Instructions

### Prerequisites
- Node.js 20+ (Node 24 recommended, which includes built-in `node:sqlite`)
- npm 10+

### Quick Start (under 2 minutes)
```bash
# 1. Clone the repository
git clone https://github.com/bolatharwatmee/folio-document-editor.git
cd folio-document-editor

# 2. Install dependencies
npm install

# 3. Run automated tests (14 integration tests)
npm test

# 4. Start local development server (Client on 5173, Server on 3000)
npm run dev

# 5. Open in browser
open http://localhost:5173
```

### Production Build & Local Production Run
```bash
# Build both Vite client and TypeScript server
npm run build

# Start production server
npm start
# App is accessible at http://localhost:3000
```

---

## 5. Architecture & Design Decisions

### System Boundaries
- **Client**: React 19 single-page app bundled with Vite. Rich text editing is handled via ProseMirror with a custom schema (headings, paragraphs, bullet lists, ordered lists, bold, italic, underline). Styling uses pure semantic CSS with custom properties, responsive layouts, and WCAG AA accessible contrast.
- **Server**: Express 5 on Node.js using native `node:sqlite` in WAL mode (or Cloudflare Pages Functions + Cloudflare D1 on the live edge). All route handlers enforce schema validation via Zod before executing parameterized SQL queries.
- **Relational Data Model**:
  - `users`: ID, name, email, avatar color.
  - `documents`: ID, title, content (ProseMirror JSON AST), revision counter, owner ID, created/updated timestamps.
  - `document_shares`: Relational link between `document_id` and `user_id` with `role` (`editor` or `viewer`).
  - `sessions`: Ephemeral demo session tokens linked to user IDs with HttpOnly cookies.

### Why ProseMirror AST instead of raw HTML?
Storing arbitrary HTML in databases introduces massive security risks (XSS) and brittle parsing bugs across browsers. Folio models all document content as a strictly typed JSON Abstract Syntax Tree (AST). The server recursively validates incoming trees against an allowlist before committing to the database.

### Why Optimistic Concurrency over Last-Write-Wins?
In collaborative environments, silent overwrites destroy user trust. Every document maintains a monotonic `revision` counter. When saving, the client sends its known revision. If the database revision has advanced (due to another user saving), the server rejects the request with HTTP `409 Conflict`. The client presents a side-by-side resolution dialog offering to save as a copy or reload the latest revision.

---

## 6. AI-Native Workflow Note

As an AI-forward engineer, AI tools (OpenCode, Claude Code, and Antigravity) were used deliberately as an engineering force multiplier:

1. **Where AI Materially Sped Up Delivery**:
   - **Boilerplate & Test Generation**: Generating the comprehensive Vitest integration test suite covering edge cases (UTF-8 encoding checks, concurrent stale writes, permission escalations).
   - **AST Serialization & Export Visitors**: Writing the recursive ProseMirror-to-Markdown and ProseMirror-to-PlainText serializer functions.
   - **Edge Infrastructure Config**: Accelerating Cloudflare D1 schema migrations and Pages Functions route bindings.

2. **What AI Output Was Changed or Rejected**:
   - *Rejected Uncontrolled HTML ContentEditable*: AI initially suggested a lightweight `contenteditable` wrapper with `dangerouslySetInnerHTML`. I rejected this due to security vulnerabilities and lack of structural integrity, replacing it with a typed ProseMirror AST engine.
   - *Rejected Last-Write-Wins Persistence*: AI initially generated standard SQL `UPDATE documents SET content = ? WHERE id = ?`. I rejected this and insisted on revision-checked atomic concurrency (`WHERE id = ? AND revision = ?`) to prevent data loss.
   - *Rejected Heavy External Auth Providers*: AI suggested adding Auth0/Supabase Auth. For this 4-6 hour evaluation scope, requiring reviewers to create third-party accounts creates unnecessary friction. I designed the deterministic synthetic switcher instead.

3. **Verification & Quality Assurance**:
   - Every AI-generated file was reviewed and validated against strict TypeScript compiler checks (`tsc --noEmit`).
   - Ran 14 automated integration tests exercising end-to-end HTTP endpoints.
   - Performed browser-level walkthroughs across all three user roles (Alice, Bob, Carol) verifying access control, sharing, conflict handling, and live export behavior.

---

## 7. What Works, What Was Deprioritized, and Future Work

### What Works Fully End-to-End
- Full rich-text document lifecycle (creation, title renaming, rich text formatting, explicit save, reload).
- File import for UTF-8 `.txt` documents up to 200 KB.
- Granular owner-controlled sharing with `editor` and `viewer` roles.
- Strict multi-tenant isolation (unshared documents return 404).
- Optimistic concurrency control with non-destructive 409 conflict handling.
- Export to Markdown, Plain Text, and Print-to-PDF.
- Real-time multi-field dashboard search.
- 100% automated test coverage across critical user and data flows.
- Production deployment on Cloudflare Pages + D1 edge SQLite.

### What Was Intentionally Deprioritized
- **Full Operational Transformation (OT) / CRDTs (e.g., Yjs)**: Real-time character-by-character collaboration was deprioritized because building robust OT/CRDT exceeds the 4-6 hour timebox. Instead, Folio delivers rock-solid explicit persistence with atomic revision conflict detection.
- **Complex Rich Media (Images, Tables)**: Kept formatting scoped to headings, bold, italic, underline, and lists to ensure high UX polish rather than shallow, buggy media embeds.

### What I Would Build Next (with 2–4 Additional Hours)
1. **Live Presence & Collaborative Awareness**: Implement Server-Sent Events (SSE) to show active collaborator avatars in the header when viewing the same document.
2. **Revision History & Diffs**: Store historic snapshots on each save to allow browsing and restoring prior revisions.
3. **Inline Commenting**: Allow selecting a text span to attach a discussion thread with resolve/reopen states.
