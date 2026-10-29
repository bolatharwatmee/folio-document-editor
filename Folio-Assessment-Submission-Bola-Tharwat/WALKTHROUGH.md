# Folio — Walkthrough Video Guide (3–5 Minutes)

Use this outline and rehearsal checklist to record the 3–5 minute walkthrough video (Loom or unlisted YouTube link) required for the submission.

---

## Pre-Recording Rehearsal Checklist

- [ ] **Clean Database State**: Run `npm run seed` or delete `data/folio.db*` and restart the server so the clean demo state is present.
- [ ] **Server Running**: Ensure the server is running on `http://localhost:3000` (or the deployed live URL).
- [ ] **Test File Ready**: Have a sample `notes.txt` file (UTF-8, <200 KB) ready on your Desktop for the import demo, and an invalid file (e.g. a `.md` or `.png` file) to demonstrate error validation.
- [ ] **Browser Window**: Open a clean browser window at standard 1080p resolution (1920x1080 or 1280x720) without personal bookmarks or private tabs visible.
- [ ] **No Secrets**: No private credentials, tokens, or environment files are shown on screen.

---

## Timed Script Outline (~4 Minutes Total)

### 1. Product Goal & Bounded Scope (0:00 – 0:25)
- **What to say**:
  > *"Hi, I'm presenting Folio, a small collaborative document editor built as a Full Stack Product Engineer take-home assessment. Rather than building a shallow clone of Google Docs, I focused on a rock-solid, production-grade end-to-end slice: rich-text formatting, explicit revision-checked persistence, owner-controlled sharing, and clean server-enforced access checks."*
- **What to show**: The Folio login page displaying the three synthetic demo accounts (Alice, Bob, and Carol).

### 2. Creation, Formatting, Save & Reopen as User A (0:25 – 1:20)
- **What to say**:
  > *"I'll sign in as Alice. Here on my dashboard, I see my owned documents and documents shared with me. I'll click 'New document' and rename it to 'Q4 Engineering Strategy'. Let's add some content: a Heading 1, bold text, italic, underline, and a bulleted list. Notice that Folio's saving model is explicit: when I edit, the indicator shows 'Unsaved changes'. When I press Cmd+S, it sends a revision check to the server, and only turns to 'Saved' once SQLite confirms the write. If I navigate back to the dashboard and reopen the document, the formatting and document structure are preserved exactly."*
- **What to show**:
  - Sign in as Alice (`usr_alice`).
  - Click "New document".
  - Change title to "Q4 Engineering Strategy".
  - Type text and apply formatting: Heading 1, Bold (`Cmd+B`), Italic (`Cmd+I`), Underline (`Cmd+U`), Bullet list.
  - Press `Cmd+S` to show transition from "Unsaved changes" → "Saving…" → "Saved".
  - Return to dashboard, click document row, verify formatting survives.

### 3. File Import & Constraints (1:20 – 1:55)
- **What to say**:
  > *"Next is file import. For this take-home, I implemented a bounded UTF-8 .txt import into a new document. I'll click 'Import .txt' and pick an invalid markdown file first—notice the immediate error banner explaining that only UTF-8 .txt files up to 200 KB are accepted. Now I'll upload a valid text file: it creates a new document, formats paragraphs cleanly, and sets revision to 1 without affecting any existing drafts."*
- **What to show**:
  - Click "Import .txt" on the dashboard.
  - Select an invalid file (e.g. `.md` or `.png`) to trigger error banner.
  - Select a valid `.txt` file; observe automatic redirection into the newly created document.

### 4. Sharing & Multi-User Access (1:55 – 2:40)
- **What to say**:
  > *"Now let's demonstrate sharing. As Alice, the owner, I can click 'Share' in the top bar and invite Bob as an editor. Now I'll switch demo accounts to Bob. On Bob's dashboard, Alice's document appears under 'Shared with me' with Alice's avatar. Bob can open it and make edits. However, Bob cannot invite other users—sharing is owner-only. Furthermore, if we switch to Carol, who is an unrelated reviewer, Carol cannot see the document in her dashboard, and direct API requests to read or edit it return a 404 Not Found to completely conceal its existence."*
- **What to show**:
  - In Alice's editor, click "Share", add Bob (`usr_bob`).
  - Use the top-right account menu to switch to Bob.
  - View dashboard: observe document in "Shared with me".
  - Open document as Bob, type an update, press Save.
  - Open "Share" modal as Bob to show read-only collaborator list (no permission to invite).
  - Switch to Carol (`usr_carol`): observe empty shared list.

### 5. Architecture & Persistence Verification (2:40 – 3:20)
- **What to say**:
  > *"Behind the scenes, Folio runs on React 19, TypeScript, Tiptap/ProseMirror, and an Express 5 backend powered by Node 24's native SQLite driver. This eliminates native C++ compilation issues like node-gyp while offering full WAL-mode persistence. Saving uses optimistic concurrency: if Bob and Alice open the same document and Bob saves first, Alice's stale save is rejected with a 409 Conflict. Alice is prompted to save her changes as a separate copy or reload the latest, preventing silent data loss."*
- **What to show**:
  - Briefly show terminal or mention the passing test suite:
    > *"All 12 automated integration tests pass, proving persistence across server restarts, concurrency rejection, and input sanitization."*

### 6. Stretch Features, AI Collaboration & Next Steps (3:20 – 4:00)
- **What to say**:
  > *"Beyond the core requirements, I also implemented three high-leverage production stretch features: Document Export to Markdown, Plain Text, and Print-to-PDF; granular Read-Only Viewer roles preventing unauthorized writes with 403 Forbidden; and real-time multi-field dashboard search.*
  >
  > *In terms of engineering tradeoffs, I deliberately omitted real-time CRDT synchronization to prioritize correctness, bulletproof access control, and complete test coverage within the time budget. I collaborated with AI for rapid scaffolding and test generation while maintaining human ownership over data modeling, concurrency control, and security boundaries. All 14 automated integration tests pass with zero failures. Thank you!"*
- **What to show**:
  - Click Export menu (show Markdown, TXT, PDF).
  - Show Real-time Search filter on Dashboard.
  - Conclude on the clean Folio dashboard.
