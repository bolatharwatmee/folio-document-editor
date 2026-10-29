import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`toolbar-button${active ? " toolbar-button-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="toolbar-divider" aria-hidden="true" />;
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      heading: current.isActive("heading", { level: 1 })
        ? "1"
        : current.isActive("heading", { level: 2 })
          ? "2"
          : current.isActive("heading", { level: 3 })
            ? "3"
            : "0",
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const setTextStyle = (value: string) => {
    if (value === "0") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor
      .chain()
      .focus()
      .setHeading({ level: Number(value) as 1 | 2 | 3 })
      .run();
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar-group">
        <ToolbarButton
          label="Undo (Cmd/Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo (Cmd/Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={17} />
        </ToolbarButton>
      </div>

      <Divider />

      <div className="toolbar-group">
        <label className="visually-hidden" htmlFor="text-style-select">
          Text style
        </label>
        <select
          id="text-style-select"
          className="toolbar-select"
          value={state.heading}
          onChange={(event) => setTextStyle(event.target.value)}
          title="Text style"
        >
          <option value="0">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
      </div>

      <Divider />

      <div className="toolbar-group">
        <ToolbarButton
          label="Bold (Cmd/Ctrl+B)"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic (Cmd/Ctrl+I)"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline (Cmd/Ctrl+U)"
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={17} />
        </ToolbarButton>
      </div>

      <Divider />

      <div className="toolbar-group">
        <ToolbarButton
          label="Bulleted list"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} />
        </ToolbarButton>
      </div>
    </div>
  );
}
