//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UseComposeReturn } from "@/components/compose/use_compose";
import type { Attachment } from "@/components/compose/compose_shared";

import { useRef, useState, useCallback, useEffect } from "react";

import { CloseIcon } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_file_icon_color,
  FILE_INPUT_ACCEPT,
} from "@/components/compose/compose_shared";

function get_file_type_icon(mime_type: string): React.ReactNode {
  const cls = "w-3.5 h-3.5";

  if (mime_type.startsWith("image/")) {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
      </svg>
    );
  }
  if (mime_type.startsWith("video/")) {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    );
  }
  if (mime_type.startsWith("audio/")) {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z" />
      </svg>
    );
  }
  if (mime_type === "application/pdf") {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z" />
      </svg>
    );
  }
  if (mime_type.includes("spreadsheet") || mime_type.includes("excel") || mime_type === "text/csv") {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z" />
      </svg>
    );
  }
  if (mime_type.includes("zip") || mime_type.includes("compressed") || mime_type.includes("rar")) {
    return (
      <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z" />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
    </svg>
  );
}

function AttachmentRow({
  attachment,
  on_remove,
}: {
  attachment: Attachment;
  on_remove: (id: string) => void;
}) {
  const color = get_file_icon_color(attachment.mime_type);

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded group hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      <span
        className="flex-shrink-0"
        style={{ color: color.text }}
      >
        {get_file_type_icon(attachment.mime_type)}
      </span>
      <span
        className="text-xs truncate flex-1 min-w-0 text-txt-primary"
        title={attachment.name}
      >
        {attachment.name}
      </span>
      <span className="text-[11px] text-txt-tertiary flex-shrink-0">
        {attachment.size}
      </span>
      <button
        className="text-txt-tertiary hover:text-txt-primary transition-colors duration-150 flex-shrink-0 opacity-0 group-hover:opacity-100"
        type="button"
        onClick={() => on_remove(attachment.id)}
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ComposeAttachmentsProps {
  compose: UseComposeReturn;
  show_add_button?: boolean;
}

export function ComposeAttachments({
  compose,
  show_add_button = false,
}: ComposeAttachmentsProps) {
  const { t } = use_i18n();

  if (compose.attachments.length === 0) return null;

  return (
    <div
      ref={compose.attachments_scroll_ref}
      className="border-t flex-shrink-0 border-edge-primary flex flex-col px-2 py-1.5 max-h-[140px] overflow-y-auto overscroll-contain"
    >
      {compose.attachments.map((attachment) => (
        <AttachmentRow
          key={attachment.id}
          attachment={attachment}
          on_remove={compose.remove_attachment}
        />
      ))}
      {show_add_button && (
        <button
          className="flex items-center gap-2 px-2 py-1 text-[11px] text-txt-tertiary hover:text-txt-primary border border-dashed border-edge-primary rounded hover:border-edge-secondary transition-colors mt-0.5"
          type="button"
          onClick={compose.trigger_file_select}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          <span>{t("mail.add_file")}</span>
        </button>
      )}
    </div>
  );
}

interface AttachmentListSimpleProps {
  attachments: Attachment[];
  attachments_scroll_ref: React.RefObject<HTMLDivElement>;
  remove_attachment: (id: string) => void;
  trigger_file_select: () => void;
  add_label: string;
}

export function AttachmentListSimple({
  attachments,
  attachments_scroll_ref,
  remove_attachment,
  trigger_file_select,
  add_label,
}: AttachmentListSimpleProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      ref={attachments_scroll_ref}
      className="border-t border-edge-primary flex flex-col px-2 py-1.5 max-h-[140px] overflow-y-auto overscroll-contain"
    >
      {attachments.map((attachment) => (
        <AttachmentRow
          key={attachment.id}
          attachment={attachment}
          on_remove={remove_attachment}
        />
      ))}
      <button
        className="flex items-center gap-2 px-2 py-1 text-[11px] text-txt-tertiary hover:text-txt-primary border border-dashed border-edge-primary rounded hover:border-edge-secondary transition-colors mt-0.5"
        type="button"
        onClick={trigger_file_select}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        <span>{add_label}</span>
      </button>
    </div>
  );
}

interface ComposeErrorsProps {
  compose: UseComposeReturn;
}

export function ComposeErrors({ compose }: ComposeErrorsProps) {
  return (
    <>
      {compose.attachment_error && (
        <div
          className="mx-3 mb-2 p-3 rounded-lg border flex items-center gap-2 flex-shrink-0"
          style={{
            backgroundColor: "#d97706",
            color: "#fff",
          }}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="currentColor"
            style={{ color: "#fff" }}
            viewBox="0 0 24 24"
          >
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          <span className="text-xs flex-1" style={{ color: "#fff" }}>
            {compose.attachment_error}
          </span>
          <button
            className="flex-shrink-0"
            style={{ color: "rgba(255, 255, 255, 0.8)" }}
            type="button"
            onClick={() => compose.set_attachment_error(null)}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

interface ComposeFileInputProps {
  compose: UseComposeReturn;
}

export function ComposeFileInput({ compose }: ComposeFileInputProps) {
  return (
    <input
      ref={compose.file_input_ref}
      multiple
      accept={FILE_INPUT_ACCEPT}
      className="hidden"
      type="file"
      onChange={compose.handle_file_select}
    />
  );
}

interface ComposeFileInputSimpleProps {
  file_input_ref: React.RefObject<HTMLInputElement>;
  handle_file_select: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ComposeFileInputSimple({
  file_input_ref,
  handle_file_select,
}: ComposeFileInputSimpleProps) {
  return (
    <input
      ref={file_input_ref}
      multiple
      accept={FILE_INPUT_ACCEPT}
      className="hidden"
      type="file"
      onChange={handle_file_select}
    />
  );
}

interface ComposeEditorProps {
  compose: UseComposeReturn;
  placeholder?: string;
}

const HANDLE_SIZE = 10;
const HANDLE_POSITIONS: Record<
  string,
  {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    cursor: string;
  }
> = {
  nw: {
    top: `-${HANDLE_SIZE / 2}px`,
    left: `-${HANDLE_SIZE / 2}px`,
    cursor: "nw-resize",
  },
  ne: {
    top: `-${HANDLE_SIZE / 2}px`,
    right: `-${HANDLE_SIZE / 2}px`,
    cursor: "ne-resize",
  },
  sw: {
    bottom: `-${HANDLE_SIZE / 2}px`,
    left: `-${HANDLE_SIZE / 2}px`,
    cursor: "sw-resize",
  },
  se: {
    bottom: `-${HANDLE_SIZE / 2}px`,
    right: `-${HANDLE_SIZE / 2}px`,
    cursor: "se-resize",
  },
};

const TOOLBAR_HEIGHT = 24;
const TOOLBAR_GAP = 6;

function compute_toolbar_vertical(
  img_top: number,
  img_height: number,
  container_height: number,
  scroll_top: number,
): { top?: string; bottom?: string } {
  const space_bottom = container_height + scroll_top - (img_top + img_height);
  const space_top = img_top - scroll_top;

  if (space_bottom >= TOOLBAR_HEIGHT + TOOLBAR_GAP) {
    return { top: `${img_height + TOOLBAR_GAP}px` };
  }

  if (space_top >= TOOLBAR_HEIGHT + TOOLBAR_GAP) {
    return { top: `${-TOOLBAR_HEIGHT - TOOLBAR_GAP}px` };
  }

  return { top: `${img_height - TOOLBAR_HEIGHT - 4}px` };
}

function SizeInput({
  width,
  height,
  on_change,
}: {
  width: number;
  height: number;
  on_change: (w: number) => void;
}) {
  const [editing, set_editing] = useState(false);
  const [value, set_value] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);
  const aspect = height / width;

  const start_edit = useCallback(() => {
    set_value(String(Math.round(width)));
    set_editing(true);
    requestAnimationFrame(() => input_ref.current?.select());
  }, [width]);

  const commit = useCallback(() => {
    const parsed = parseInt(value, 10);

    if (parsed > 0 && parsed !== Math.round(width)) {
      on_change(parsed);
    }
    set_editing(false);
  }, [value, width, on_change]);

  const handle_key = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        set_editing(false);
      }
    },
    [commit],
  );

  if (editing) {
    const new_h =
      parseInt(value, 10) > 0
        ? Math.round(parseInt(value, 10) * aspect)
        : Math.round(height);

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "1px",
          padding: "0 6px",
          height: "20px",
          fontSize: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          color: "#fff",
          borderRadius: "3px",
          whiteSpace: "nowrap",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input_ref}
          style={{
            width: "36px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#fff",
            fontSize: "10px",
            textAlign: "right",
            padding: 0,
          }}
          type="text"
          value={value}
          onBlur={commit}
          onChange={(e) => set_value(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handle_key}
        />
        <span style={{ opacity: 0.5 }}>×</span>
        <span style={{ width: "30px" }}>{new_h}</span>
      </span>
    );
  }

  return (
    <button
      style={{
        padding: "0 6px",
        height: "20px",
        fontSize: "10px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        color: "#fff",
        border: "none",
        borderRadius: "3px",
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start_edit();
      }}
    >
      {Math.round(width)} × {Math.round(height)}
    </button>
  );
}

function ImageResizeOverlay({
  compose,
  container_ref,
}: {
  compose: UseComposeReturn;
  container_ref: React.RefObject<HTMLElement>;
}) {
  const {
    selected_image,
    start_image_resize,
    delete_selected_image,
    set_image_width,
  } = compose.editor;

  if (!selected_image.image || !selected_image.rect || !container_ref.current)
    return null;

  const container_rect = container_ref.current.getBoundingClientRect();
  const img_rect = selected_image.rect;

  const top =
    img_rect.top - container_rect.top + container_ref.current.scrollTop;
  const left =
    img_rect.left - container_rect.left + container_ref.current.scrollLeft;

  const toolbar_vertical = compute_toolbar_vertical(
    top,
    img_rect.height,
    container_ref.current.clientHeight,
    container_ref.current.scrollTop,
  );

  return (
    <div
      style={{
        position: "absolute",
        top: `${top}px`,
        left: `${left}px`,
        width: `${img_rect.width}px`,
        height: `${img_rect.height}px`,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0",
          border: "2px solid var(--accent-primary, #3b82f6)",
          pointerEvents: "none",
        }}
      />
      {Object.entries(HANDLE_POSITIONS).map(([key, pos]) => (
        <div
          key={key}
          style={{
            position: "absolute",
            width: `${HANDLE_SIZE}px`,
            height: `${HANDLE_SIZE}px`,
            backgroundColor: "var(--accent-primary, #3b82f6)",
            border: "1px solid white",
            borderRadius: "2px",
            cursor: pos.cursor,
            pointerEvents: "auto",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            right: pos.right,
          }}
          onMouseDown={(e) => start_image_resize(e, key, container_ref)}
        />
      ))}
      <div
        style={{
          position: "absolute",
          ...toolbar_vertical,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "4px",
          alignItems: "center",
          pointerEvents: "auto",
        }}
      >
        <SizeInput
          height={img_rect.height}
          on_change={set_image_width}
          width={img_rect.width}
        />
        <button
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            fontSize: "11px",
            backgroundColor: "rgba(239, 68, 68, 0.85)",
            color: "#fff",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
            lineHeight: 1,
          }}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            delete_selected_image();
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function ComposeEditor({ compose, placeholder }: ComposeEditorProps) {
  const { t } = use_i18n();
  const resolved_placeholder = placeholder || t("common.write_your_message");
  const scroll_container_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = compose.message_textarea_ref.current;

    if (el && compose.message && !el.innerHTML) {
      el.innerHTML = compose.message;
    }
  });

  return (
    <div className="flex-1 px-4 pt-2 pb-2 overflow-hidden flex flex-col min-h-0">
      <div
        ref={scroll_container_ref}
        className="flex-1 overflow-auto"
        style={{ position: "relative" }}
      >
        <div
          ref={compose.message_textarea_ref}
          contentEditable
          suppressContentEditableWarning
          className="w-full h-full text-sm leading-relaxed border-none outline-none bg-transparent text-txt-primary"
          data-placeholder={resolved_placeholder}
          style={{
            minHeight: "150px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          onBlur={compose.handle_editor_input}
          onDragOver={compose.editor.handle_drag_over}
          onDrop={compose.editor.handle_drop}
          onInput={compose.handle_editor_input}
          onPaste={compose.handle_editor_paste}
        />
        <ImageResizeOverlay
          compose={compose}
          container_ref={scroll_container_ref as React.RefObject<HTMLElement>}
        />
      </div>
      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
        }
        [contenteditable=true] img {
          cursor: pointer;
        }
        [contenteditable=true] img:hover {
          outline: 2px solid color-mix(in srgb, var(--accent-primary, #3b82f6) 50%, transparent);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
