import { useCallback, useState, useEffect, useRef } from "react";

interface EditorToolbarProps {
  editor_ref: React.RefObject<HTMLDivElement | null>;
  on_change?: () => void;
}

type ListType = "ul" | "ol";

function get_closest_list(
  node: Node | null,
): HTMLUListElement | HTMLOListElement | null {
  if (!node) return null;

  let current: Node | null = node;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as HTMLElement).tagName;

      if (tag === "UL" || tag === "OL") {
        return current as HTMLUListElement | HTMLOListElement;
      }
    }
    current = current.parentNode;
  }

  return null;
}

function is_inside_list(node: Node | null, list_type: ListType): boolean {
  const list = get_closest_list(node);

  if (!list) return false;

  return list.tagName.toLowerCase() === list_type;
}

function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      className={`
        p-1.5 rounded-md transition-all duration-150
        ${active ? "bg-blue-500/15 text-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10"}
      `}
      style={{ color: active ? undefined : "var(--text-muted)" }}
      title={title}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-5 mx-1"
      style={{ backgroundColor: "var(--border-secondary)" }}
    />
  );
}

export function EditorToolbar({ editor_ref, on_change }: EditorToolbarProps) {
  const [active_formats, set_active_formats] = useState<Set<string>>(new Set());
  const saved_selection_ref = useRef<Range | null>(null);

  const save_selection = useCallback(() => {
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      saved_selection_ref.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const restore_selection = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor || !saved_selection_ref.current) return;
    editor.focus();
    const selection = window.getSelection();

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(saved_selection_ref.current);
    }
  }, [editor_ref]);

  const check_active_formats = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) return;

    const formats = new Set<string>();

    try {
      if (document.queryCommandState("bold")) formats.add("bold");
      if (document.queryCommandState("italic")) formats.add("italic");
      if (document.queryCommandState("underline")) formats.add("underline");

      const anchor = selection.anchorNode;

      if (is_inside_list(anchor, "ol")) {
        formats.add("orderedList");
      }
      if (is_inside_list(anchor, "ul")) {
        formats.add("unorderedList");
      }
    } catch {
      return;
    }

    set_active_formats(formats);
  }, [editor_ref]);

  const exec_command = useCallback(
    (command: string, value?: string) => {
      const editor = editor_ref.current;

      if (!editor) return;

      restore_selection();
      document.execCommand(command, false, value);
      on_change?.();
      requestAnimationFrame(save_selection);
    },
    [editor_ref, on_change, restore_selection, save_selection],
  );

  useEffect(() => {
    const handle_selection = () => {
      save_selection();
      requestAnimationFrame(check_active_formats);
    };

    document.addEventListener("selectionchange", handle_selection);

    return () =>
      document.removeEventListener("selectionchange", handle_selection);
  }, [check_active_formats, save_selection]);

  useEffect(() => {
    const editor = editor_ref.current;

    if (!editor) return;
    const handle_keydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (key === "b" || key === "i" || key === "u") {
          e.preventDefault();
          const cmd =
            key === "b" ? "bold" : key === "i" ? "italic" : "underline";

          document.execCommand(cmd, false);
          on_change?.();
          requestAnimationFrame(check_active_formats);
        }
      }
    };

    editor.addEventListener("keydown", handle_keydown);

    return () => editor.removeEventListener("keydown", handle_keydown);
  }, [editor_ref, on_change, check_active_formats]);

  const handle_link = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    restore_selection();
    const selection = window.getSelection();
    const selected_text = selection?.toString() || "";
    const saved_range = selection?.rangeCount
      ? selection.getRangeAt(0).cloneRange()
      : null;
    const url = prompt("Enter URL:", "https://");

    if (url?.trim()) {
      const trimmed_url = url.trim();
      const lower_url = trimmed_url.toLowerCase();

      if (
        !lower_url.startsWith("http://") &&
        !lower_url.startsWith("https://") &&
        !lower_url.startsWith("mailto:")
      ) {
        return;
      }

      editor.focus();
      if (saved_range) {
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(saved_range);
      }

      const safe_url = encodeURI(trimmed_url).replace(/"/g, "%22");

      if (selected_text) {
        document.execCommand("createLink", false, safe_url);
        editor.querySelectorAll(`a[href="${safe_url}"]`).forEach((link) => {
          (link as HTMLElement).style.color = "#3b82f6";
          (link as HTMLElement).style.textDecoration = "underline";
        });
      } else {
        const link_text =
          prompt("Enter link text:", trimmed_url) || trimmed_url;
        const safe_text = escape_html(link_text);

        document.execCommand(
          "insertHTML",
          false,
          `<a href="${safe_url}" style="color: #3b82f6; text-decoration: underline;">${safe_text}</a>`,
        );
      }
      on_change?.();
    }
  }, [editor_ref, restore_selection, on_change]);

  return (
    <div className="flex items-center gap-0.5 py-1.5 px-1">
      <ToolbarButton
        active={active_formats.has("bold")}
        title="Bold (Ctrl+B)"
        onClick={() => exec_command("bold")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("italic")}
        title="Italic (Ctrl+I)"
        onClick={() => exec_command("italic")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("underline")}
        title="Underline (Ctrl+U)"
        onClick={() => exec_command("underline")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={active_formats.has("unorderedList")}
        title="Bullet list"
        onClick={() => exec_command("insertUnorderedList")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("orderedList")}
        title="Numbered list"
        onClick={() => exec_command("insertOrderedList")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Insert link" onClick={handle_link}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
