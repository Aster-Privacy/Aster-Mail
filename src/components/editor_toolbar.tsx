import { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import { ColorPicker } from "@/components/ui/color_picker";

interface EditorToolbarProps {
  editor_ref: React.RefObject<HTMLDivElement | null>;
  on_change?: () => void;
  compact?: boolean;
}

function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type ListType = "ul" | "ol";

function get_closest_block_element(node: Node | null): HTMLElement | null {
  if (!node) return null;

  let current: Node | null = node;

  while (current && current.nodeType !== Node.ELEMENT_NODE) {
    current = current.parentNode;
  }

  if (!current) return null;

  const element = current as HTMLElement;
  const block_tags = new Set([
    "P",
    "DIV",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "PRE",
  ]);

  let block: HTMLElement | null = element;

  while (block && !block_tags.has(block.tagName)) {
    block = block.parentElement;
  }

  return block;
}

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

function get_text_content_for_list_item(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const tag = element.tagName;

    if (tag === "BR") return "\n";

    let text = "";

    for (let i = 0; i < element.childNodes.length; i++) {
      text += get_text_content_for_list_item(element.childNodes[i]);
    }

    if (tag === "DIV" || tag === "P") {
      text += "\n";
    }

    return text;
  }

  return "";
}

function split_into_lines(content: string): string[] {
  return content
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function create_list_from_selection(
  editor: HTMLElement,
  list_type: ListType,
  selection: Selection,
): boolean {
  if (!selection.rangeCount) return false;

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) return false;

  const existing_list = get_closest_list(range.commonAncestorContainer);

  if (existing_list) {
    const current_type = existing_list.tagName.toLowerCase() as ListType;

    if (current_type === list_type) {
      unwrap_list(existing_list);
    } else {
      convert_list_type(existing_list, list_type);
    }

    return true;
  }

  if (range.collapsed) {
    const block = get_closest_block_element(range.startContainer);

    if (block) {
      wrap_block_in_list(block, list_type);
    } else {
      insert_empty_list(editor, range, list_type);
    }

    return true;
  }

  const content = range.cloneContents();
  const text = get_text_content_for_list_item(content);
  const lines = split_into_lines(text);

  if (lines.length === 0) {
    lines.push("");
  }

  const list = document.createElement(list_type);

  lines.forEach((line) => {
    const li = document.createElement("li");

    li.textContent = line || "\u200B";
    list.appendChild(li);
  });

  range.deleteContents();
  range.insertNode(list);

  const new_range = document.createRange();
  const first_li = list.querySelector("li");

  if (first_li) {
    new_range.selectNodeContents(first_li);
    new_range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(new_range);
  }

  return true;
}

function unwrap_list(list: HTMLUListElement | HTMLOListElement): void {
  const parent = list.parentNode;

  if (!parent) return;

  const fragment = document.createDocumentFragment();
  const items = Array.from(list.querySelectorAll(":scope > li"));

  items.forEach((li, index) => {
    const div = document.createElement("div");

    while (li.firstChild) {
      div.appendChild(li.firstChild);
    }

    fragment.appendChild(div);

    if (index < items.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });

  parent.replaceChild(fragment, list);
}

function convert_list_type(
  list: HTMLUListElement | HTMLOListElement,
  new_type: ListType,
): void {
  const new_list = document.createElement(new_type);

  while (list.firstChild) {
    new_list.appendChild(list.firstChild);
  }

  list.parentNode?.replaceChild(new_list, list);
}

function wrap_block_in_list(block: HTMLElement, list_type: ListType): void {
  const list = document.createElement(list_type);
  const li = document.createElement("li");

  while (block.firstChild) {
    li.appendChild(block.firstChild);
  }

  if (!li.hasChildNodes()) {
    li.appendChild(document.createTextNode("\u200B"));
  }

  list.appendChild(li);
  block.parentNode?.replaceChild(list, block);

  const range = document.createRange();

  range.selectNodeContents(li);
  range.collapse(false);

  const selection = window.getSelection();

  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function insert_empty_list(
  editor: HTMLElement,
  range: Range,
  list_type: ListType,
): void {
  const list = document.createElement(list_type);
  const li = document.createElement("li");

  li.appendChild(document.createTextNode("\u200B"));
  list.appendChild(li);

  let insert_point: Node = range.startContainer;

  if (insert_point === editor) {
    editor.appendChild(list);
  } else {
    while (insert_point.parentNode && insert_point.parentNode !== editor) {
      insert_point = insert_point.parentNode;
    }

    if (insert_point.nextSibling) {
      editor.insertBefore(list, insert_point.nextSibling);
    } else {
      editor.appendChild(list);
    }
  }

  const new_range = document.createRange();

  new_range.selectNodeContents(li);
  new_range.collapse(true);

  const selection = window.getSelection();

  if (selection) {
    selection.removeAllRanges();
    selection.addRange(new_range);
  }
}

function is_inside_list(node: Node | null, list_type: ListType): boolean {
  const list = get_closest_list(node);

  if (!list) return false;

  return list.tagName.toLowerCase() === list_type;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      className={`
        p-1 rounded transition-all duration-150
        ${active ? "bg-blue-500/15 text-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10"}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
      `}
      disabled={disabled}
      style={{ color: active ? undefined : "var(--text-tertiary)" }}
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
      className="w-px h-4 mx-1 opacity-40"
      style={{ backgroundColor: "var(--border-secondary)" }}
    />
  );
}

interface ColorPickerButtonProps {
  color: string;
  open: boolean;
  onChange: (color: string) => void;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function ColorPickerButton({
  color,
  open,
  onChange,
  onOpenChange,
  children,
}: ColorPickerButtonProps) {
  return (
    <ColorPicker
      open={open}
      value={color}
      onChange={onChange}
      onOpenChange={onOpenChange}
    >
      <button
        className="px-1.5 py-1 rounded cursor-pointer flex flex-col items-center justify-center transition-all hover:bg-black/5 dark:hover:bg-white/10"
        style={{ color: "var(--text-tertiary)" }}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
      >
        {children}
        <div
          className="w-4 h-1 rounded-sm mt-0.5"
          style={{ backgroundColor: color }}
        />
      </button>
    </ColorPicker>
  );
}

const font_size_presets = [
  { label: "S", value: 12 },
  { label: "M", value: 16 },
  { label: "L", value: 20 },
  { label: "XL", value: 28 },
] as const;

const SLIDER_STYLES = `
  .font-size-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    outline: none;
  }
  .font-size-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .font-size-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
  }
  .font-size-slider::-webkit-slider-thumb:active {
    transform: scale(0.95);
  }
  .font-size-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: transform 0.15s ease;
  }
  .font-size-slider::-moz-range-thumb:hover {
    transform: scale(1.1);
  }
`;

export function EditorToolbar({ editor_ref, on_change }: EditorToolbarProps) {
  const [active_formats, set_active_formats] = useState<Set<string>>(new Set());
  const [show_font_size, set_show_font_size] = useState(false);
  const [font_size, set_font_size] = useState(16);
  const [text_color, set_text_color] = useState("#3b82f6");
  const [highlight_color, set_highlight_color] = useState("#3b82f6");
  const [open_color_picker, set_open_color_picker] = useState<
    "text" | "highlight" | null
  >(null);

  const font_size_btn_ref = useRef<HTMLDivElement>(null);
  const font_size_popup_ref = useRef<HTMLDivElement>(null);
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
      if (document.queryCommandState("strikeThrough"))
        formats.add("strikethrough");

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

  const toggle_list = useCallback(
    (list_type: ListType) => {
      const editor = editor_ref.current;

      if (!editor) return;

      editor.focus();
      restore_selection();

      const selection = window.getSelection();

      if (!selection) return;

      if (!selection.rangeCount) {
        const range = document.createRange();

        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const success = create_list_from_selection(editor, list_type, selection);

      if (!success) {
        const cmd =
          list_type === "ul" ? "insertUnorderedList" : "insertOrderedList";

        document.execCommand(cmd, false);
      }

      on_change?.();
      requestAnimationFrame(() => {
        check_active_formats();
        save_selection();
      });
    },
    [
      editor_ref,
      on_change,
      restore_selection,
      check_active_formats,
      save_selection,
    ],
  );

  const apply_font_size = useCallback(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    restore_selection();
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (range.collapsed) return;

    document.execCommand("fontSize", false, "7");

    const fonts = editor.querySelectorAll('font[size="7"]');

    fonts.forEach((font) => {
      const span = document.createElement("span");

      span.style.fontSize = `${font_size}px`;
      while (font.firstChild) {
        span.appendChild(font.firstChild);
      }
      font.parentNode?.replaceChild(span, font);
    });

    on_change?.();
    requestAnimationFrame(() => {
      restore_selection();
      save_selection();
    });
  }, [editor_ref, font_size, on_change, restore_selection, save_selection]);

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
    if (!show_font_size) return;

    const handle_click_outside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (
        !font_size_btn_ref.current?.contains(target) &&
        !font_size_popup_ref.current?.contains(target)
      ) {
        set_show_font_size(false);
      }
    };

    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        set_show_font_size(false);
      }
    };

    document.addEventListener("mousedown", handle_click_outside, true);
    document.addEventListener("keydown", handle_escape);

    return () => {
      document.removeEventListener("mousedown", handle_click_outside, true);
      document.removeEventListener("keydown", handle_escape);
    };
  }, [show_font_size]);

  const handle_preset_click = useCallback(
    (size: number) => {
      const editor = editor_ref.current;

      if (!editor) return;

      set_font_size(size);
      restore_selection();

      const selection = window.getSelection();

      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      if (range.collapsed) return;

      document.execCommand("fontSize", false, "7");

      const fonts = editor.querySelectorAll('font[size="7"]');

      fonts.forEach((font) => {
        const span = document.createElement("span");

        span.style.fontSize = `${size}px`;

        while (font.firstChild) {
          span.appendChild(font.firstChild);
        }

        font.parentNode?.replaceChild(span, font);
      });

      on_change?.();
      set_show_font_size(false);
      requestAnimationFrame(() => {
        restore_selection();
        save_selection();
      });
    },
    [editor_ref, on_change, restore_selection, save_selection],
  );

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
        }
      }
    };

    editor.addEventListener("keydown", handle_keydown);

    return () => editor.removeEventListener("keydown", handle_keydown);
  }, [editor_ref, on_change]);

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

  const slider_progress = ((font_size - 8) / 64) * 100;

  return (
    <div className="flex items-center justify-start gap-0.5 py-1 px-0.5 overflow-x-auto relative z-10">
      <ToolbarButton
        active={active_formats.has("bold")}
        onClick={() => exec_command("bold")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("italic")}
        onClick={() => exec_command("italic")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("underline")}
        onClick={() => exec_command("underline")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("strikethrough")}
        onClick={() => exec_command("strikeThrough")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <div ref={font_size_btn_ref} className="relative">
        <ToolbarButton
          active={show_font_size}
          onClick={() => set_show_font_size(!show_font_size)}
        >
          <div className="flex items-center gap-0.5">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z" />
            </svg>
            <svg
              className={`w-2.5 h-2.5 transition-transform ${show_font_size ? "rotate-180" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                clipRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                fillRule="evenodd"
              />
            </svg>
          </div>
        </ToolbarButton>
        {show_font_size &&
          createPortal(
            <div
              ref={font_size_popup_ref}
              className="fixed p-3 rounded-xl shadow-xl border animate-in fade-in zoom-in-95 duration-150"
              style={{
                backgroundColor: "var(--modal-bg)",
                borderColor: "var(--border-secondary)",
                zIndex: 99999,
                top: font_size_btn_ref.current
                  ? font_size_btn_ref.current.getBoundingClientRect().bottom + 6
                  : 0,
                left: font_size_btn_ref.current
                  ? Math.max(
                      8,
                      font_size_btn_ref.current.getBoundingClientRect().left -
                        40,
                    )
                  : 0,
              }}
            >
              <style>{SLIDER_STYLES}</style>
              <div className="flex flex-col gap-3 min-w-[220px]">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Font Size
                  </span>
                  <span
                    className="text-sm font-bold px-2.5 py-1 rounded-md min-w-[52px] text-center"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-tertiary)",
                    }}
                  >
                    {font_size}px
                  </span>
                </div>

                <div className="flex gap-1.5">
                  {font_size_presets.map((preset) => (
                    <button
                      key={preset.value}
                      className={`
                        flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all
                        ${
                          font_size === preset.value
                            ? "bg-blue-500 text-white shadow-sm"
                            : "hover:bg-black/5 dark:hover:bg-white/10"
                        }
                      `}
                      style={{
                        color:
                          font_size === preset.value
                            ? undefined
                            : "var(--text-secondary)",
                        backgroundColor:
                          font_size === preset.value
                            ? undefined
                            : "var(--bg-tertiary)",
                      }}
                      type="button"
                      onClick={() => handle_preset_click(preset.value)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <input
                    className="font-size-slider w-full cursor-pointer"
                    max="72"
                    min="8"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${slider_progress}%, var(--border-secondary) ${slider_progress}%, var(--border-secondary) 100%)`,
                    }}
                    type="range"
                    value={font_size}
                    onChange={(e) => set_font_size(parseInt(e.target.value))}
                    onMouseUp={apply_font_size}
                    onTouchEnd={apply_font_size}
                  />
                  <div
                    className="flex justify-between text-[10px] px-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>8</span>
                    <span>24</span>
                    <span>48</span>
                    <span>72</span>
                  </div>
                </div>

                <div
                  className="text-[10px] text-center pt-1 border-t"
                  style={{
                    color: "var(--text-muted)",
                    borderColor: "var(--border-secondary)",
                  }}
                >
                  Select text first, then choose size
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>

      <ColorPickerButton
        color={text_color}
        open={open_color_picker === "text"}
        onChange={(color) => {
          set_text_color(color);
          exec_command("foreColor", color);
        }}
        onOpenChange={(is_open) =>
          set_open_color_picker(is_open ? "text" : null)
        }
      >
        <span
          className="text-sm font-bold leading-none"
          style={{ marginTop: "2px" }}
        >
          A
        </span>
      </ColorPickerButton>

      <ColorPickerButton
        color={highlight_color}
        open={open_color_picker === "highlight"}
        onChange={(color) => {
          set_highlight_color(color);
          exec_command("hiliteColor", color);
        }}
        onOpenChange={(is_open) =>
          set_open_color_picker(is_open ? "highlight" : null)
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 14l3 3v5h6v-5l3-3V9H6v5zm5-12h2v3h-2V2zM3.5 5.88l1.41-1.41 2.12 2.12L5.62 8 3.5 5.88zm13.46.71l2.12-2.12 1.41 1.41L18.38 8l-1.42-1.41z" />
        </svg>
      </ColorPickerButton>

      <Divider />

      <ToolbarButton onClick={() => exec_command("justifyLeft")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={() => exec_command("justifyCenter")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={() => exec_command("justifyRight")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={active_formats.has("unorderedList")}
        onClick={() => toggle_list("ul")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        active={active_formats.has("orderedList")}
        onClick={() => toggle_list("ol")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={() => exec_command("formatBlock", "<blockquote>")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={handle_link}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={() => exec_command("removeFormat")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => exec_command("undo")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={() => exec_command("redo")}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
