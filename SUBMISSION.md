# Folio — Assessment Submission Package

This document serves as the master index and completion status for the Full Stack Product Engineer take-home assessment.

---

## 1. Submission Deliverables Index

| Deliverable | Location | Description |
| :--- | :--- | :--- |
| **Source Code** | `/Users/marina/TextEditor` | Complete TypeScript codebase (React 19 client + Express 5 server + SQLite persistence). |
| **Source Archive** | `/Users/marina/TextEditor/dist-package/folio-source.tar.gz` | Clean source package excluding `node_modules`, `.git`, environment secrets, and databases. |
| **Local Run Guide** | [`README.md`](file:///Users/marina/TextEditor/README.md) | Prerequisites, install steps, environment variables, run instructions, and troubleshooting. |
| **Architecture Note** | [`ARCHITECTURE.md`](file:///Users/marina/TextEditor/ARCHITECTURE.md) | System boundaries, relational data model, access policy, revision concurrency, and tradeoffs. |
| **AI Workflow Note** | [`AI_WORKFLOW.md`](file:///Users/marina/TextEditor/AI_WORKFLOW.md) | Honest record of AI tools used, human decision boundaries, rejected approaches, and verifications. |
| **Test Verification Log** | [`TEST_RESULTS.md`](file:///Users/marina/TextEditor/TEST_RESULTS.md) | Empirical logs for Vitest suite (14/14 passing) and end-to-end multi-user restart checks. |
| **Deployment Guide** | [`DEPLOYMENT.md`](file:///Users/marina/TextEditor/DEPLOYMENT.md) | Step-by-step free deployment on Render.com & Fly.io (`render.yaml`, `fly.toml`, `Dockerfile`). |
| **Walkthrough Script** | [`WALKTHROUGH.md`](file:///Users/marina/TextEditor/WALKTHROUGH.md) | Rehearsal checklist and 4-minute timed script for the candidate's walkthrough screencast. |
| **Live Product URL** | [`LIVE_URL.txt`](file:///Users/marina/TextEditor/LIVE_URL.txt) | Ready for one-click Render deployment; includes local endpoints and reviewer instructions. |
| **Video URL** | [`VIDEO_URL.txt`](file:///Users/marina/TextEditor/VIDEO_URL.txt) | Pending candidate recording; contains remaining actions for video link handoff. |

---

## 2. Reviewer Access & Synthetic Accounts

Folio includes a dedicated demo session mechanism. Reviewers do not need to register, configure OAuth credentials, or check email tokens:

1. Open the application (locally at `http://localhost:3000` or via the authorized deployment URL).
2. Select any synthetic demo account from the login screen:
   - **`usr_alice` (Alice Nguyen)**: Document owner account. Pre-owns *Welcome to Folio*; can edit, share, and revoke access.
   - **`usr_bob` (Bob Ortega)**: Collaborator account. Pre-owns *Launch notes*; has shared editor access to Alice's *Welcome to Folio*.
   - **`usr_carol` (Carol Sato)**: Unrelated reviewer account. Pre-owns private memos; has zero access to Alice or Bob's unshared documents.
3. Switch between accounts at any time via the user badge menu in the top-right navigation bar.

---

## 3. Requirement-by-Requirement Status Matrix

| Mandatory Requirement | Status | Verification Evidence |
| :--- | :---: | :--- |
| **1. Document Creation & Editing** | **Complete** | - Creates blank documents via `POST /api/documents`.<br>- In-place document renaming with title constraints.<br>- Rich-text formatting: Headings 1–3, Bold, Italic, Underline, Bulleted List, Numbered List.<br>- Formatting and content survive save, page refresh, and process reboot.<br>- Verified in automated test `creates, renames, saves, lists, and reopens a document with formatting`. |
| **2. File Upload / Import** | **Complete** | - Plain text (`.txt`) import into a new document via `POST /api/import`.<br>- UTF-8 validation rejecting non-UTF-8 and binary files.<br>- Clear 200 KB size limit enforced client-side and server-side.<br>- Filename path traversal sanitization.<br>- Verified in automated test `imports a .txt file into a new document and rejects bad input clearly`. |
| **3. User-to-User Sharing** | **Complete** | - Ownership tracked via `owner_id` foreign key.<br>- Owner-only sharing via `POST /api/documents/:id/shares`.<br>- Shared recipients can edit, but cannot grant shares (403 Forbidden).<br>- Unrelated users completely isolated (404 Not Found on all endpoints).<br>- Dashboard distinctly separates *My documents* vs. *Shared with me* with collaborator count badges.<br>- Verified in automated test `lets an owner share and a recipient edit, while unrelated users get 404`. |
| **4. Persistence & Concurrency** | **Complete** | - Backed by SQLite via Node 24 native `node:sqlite` with WAL mode and foreign keys enabled.<br>- Data and sessions survive server shutdown and restart.<br>- Optimistic concurrency: each save checks `revision`; stale edits return 409 Conflict.<br>- Non-destructive conflict UI: "Save as Copy" or "Reload Latest".<br>- Local Storage crash recovery for drafts.<br>- Verified in automated tests `persists documents, shares, and sessions across a database restart` and `rejects stale saves instead of overwriting newer content`. |
| **5. Engineering Quality** | **Complete** | - Full TypeScript strict typing across client, server, and tests.<br>- Zod metadata validation + ProseMirror AST recursive tree walker rejecting malicious markup.<br>- Strict Content Security Policy, Frameguard, and CSRF / Sec-Fetch-Site origin verification.<br>- 12 automated integration tests passing in Vitest with zero failures.<br>- Idempotent repeatable demo seed preserving user edits. |
| **6. Live Deployment** | **Pending Owner Action** | - Packaged into a self-contained Node.js single-process build (`dist/server/index.js` serving built Vite SPA from `dist/client`).<br>- Requires single-instance host with a persistent disk volume for SQLite.<br>- Awaiting explicit candidate approval before provisioning external cloud resources. |
| **7. Walkthrough Video** | **Pending Owner Action** | - Comprehensive rehearsal checklist and timed script created in `WALKTHROUGH.md`.<br>- Screencast to be recorded and uploaded as unlisted link by candidate. |

---

## 4. What Works, What is Incomplete, and Future Work (Next 2–4 Hours)

### What Works Fully
- Complete rich-text document lifecycle (creation, title renaming, formatting, explicit persistence, reopening).
- **Document Export**: High-fidelity export to Markdown (`.md`), Plain Text (`.txt`), and Print-to-PDF (`window.print` with print-specific layout).
- **Read-Only Viewer Role**: Granular permissions distinguishing between `editor` and `viewer`, enforced at both UI level and server endpoint level (`403 Forbidden` on edits).
- **Real-Time Document Search**: Instant search filtering on the dashboard across titles, text snippets, and owner names with match counts.
- Robust concurrency conflict protection preventing silent data loss.
- Full multi-tenant permission isolation and owner-controlled sharing.
- Strict security controls (AST schema allowlist, CSP headers, CSRF origin verification, HttpOnly session cookies).
- Fast, reproducible local setup with zero external database dependencies.
- Ready-to-deploy configuration for Render.com (`render.yaml`) and Fly.io (`fly.toml` & `Dockerfile`).

### What Remains Incomplete
- **Live Cloud Deployment**: 1-click Render blueprint (`render.yaml`), Fly config, and `DEPLOYMENT.md` prepared; pending candidate pushing to GitHub and activating on Render.com.
- **Walkthrough Video**: Script ready in `WALKTHROUGH.md`; pending candidate recording.
- **Google Drive Folder Upload**: Source archive prepared; pending candidate confirmation of folder link and permissions.

### Best Future Enhancements (Beyond Core + Stretch)
With additional time, the remaining nice-to-have enhancements would include:
1. **Presence Indicators**: Introduce Server-Sent Events (SSE) or WebSockets to show active collaborator avatars in the document header.
2. **Document Version History**: Track revision diffs over time to allow restoring historical revisions.
3. **Commenting System**: Inline marginal notes and discussion threads on selected text ranges.
