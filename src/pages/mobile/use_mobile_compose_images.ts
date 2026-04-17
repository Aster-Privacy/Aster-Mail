//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useCallback, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

import {
  read_clipboard_image,
  read_clipboard_uri,
} from "@/native/clipboard_image";
import { sanitize_compose_paste } from "@/lib/html_sanitizer";

interface ComposeHandle {
  message_textarea_ref: React.RefObject<HTMLDivElement | null>;
  handle_editor_input: () => void;
  handle_editor_paste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  handle_file_select: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function style_inline_image(img: HTMLImageElement) {
  img.style.maxWidth = "100%";
  img.style.borderRadius = "8px";
  img.style.margin = "4px 0";
}

function insert_at_cursor_or_append(editor: HTMLElement, node: Node) {
  const selection = window.getSelection();

  if (
    selection &&
    selection.rangeCount > 0 &&
    editor.contains(selection.anchorNode)
  ) {
    const range = selection.getRangeAt(0);

    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(node);
  }
}

export function use_mobile_compose_images(compose: ComposeHandle) {
  const image_input_ref = useRef<HTMLInputElement>(null);

  const insert_image_file = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = (evt) => {
        const data_url = evt.target?.result as string;

        if (!data_url) return;
        const img = document.createElement("img");

        img.src = data_url;
        style_inline_image(img);

        const editor = compose.message_textarea_ref.current;

        if (editor) {
          insert_at_cursor_or_append(editor, img);
        }
        compose.handle_editor_input();
      };
      reader.readAsDataURL(file);
    },
    [compose],
  );

  const insert_data_url_image = useCallback(
    (data_url: string) => {
      const img = document.createElement("img");

      img.src = data_url;
      style_inline_image(img);

      const editor = compose.message_textarea_ref.current;

      if (!editor) return;
      insert_at_cursor_or_append(editor, img);
      compose.handle_editor_input();
    },
    [compose],
  );

  const process_pasted_image_node = useCallback(
    (img: HTMLImageElement) => {
      const src = img.src;

      if (src.startsWith("data:")) return;
      if (src.startsWith("blob:")) {
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            const reader = new FileReader();

            reader.onload = (evt) => {
              const data_url = evt.target?.result as string;

              if (data_url) {
                img.src = data_url;
                style_inline_image(img);
                compose.handle_editor_input();
              }
            };
            reader.readAsDataURL(blob);
          })
          .catch(() => {});

        return;
      }
      if (
        src.startsWith("content://") ||
        src.startsWith("webkit-fake-url://")
      ) {
        const resolve_native_uri = async () => {
          const data_url = await read_clipboard_uri(src);

          if (data_url) {
            img.src = data_url;
            style_inline_image(img);
            compose.handle_editor_input();

            return;
          }
          const fallback = await read_clipboard_image();

          if (fallback) {
            img.src = fallback;
            style_inline_image(img);
            compose.handle_editor_input();
          } else {
            img.remove();
          }
        };

        resolve_native_uri();

        return;
      }
      style_inline_image(img);
    },
    [compose],
  );

  const handle_image_select = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
          insert_image_file(files[i]);
        }
      }

      compose.handle_file_select(event);

      if (image_input_ref.current) {
        image_input_ref.current.value = "";
      }
    },
    [compose, insert_image_file],
  );

  useEffect(() => {
    const editor = compose.message_textarea_ref.current;

    if (!editor) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLImageElement) {
            process_pasted_image_node(node);
          }
          if (node instanceof HTMLElement) {
            node
              .querySelectorAll("img")
              .forEach((img) => process_pasted_image_node(img));
          }
        }
      }
    });

    observer.observe(editor, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [process_pasted_image_node]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const w = window as unknown as Record<string, unknown>;

    w.__aster_paste_image = (data_url: string) => {
      insert_data_url_image(data_url);
    };

    return () => {
      delete w.__aster_paste_image;
    };
  }, [insert_data_url_image]);

  const handle_paste_with_images = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const clipboard = e.clipboardData;

      if (!clipboard) {
        compose.handle_editor_paste(e);

        return;
      }

      const files = clipboard.files;

      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith("image/")) {
            e.preventDefault();
            insert_image_file(files[i]);

            return;
          }
        }
      }

      const items = clipboard.items;

      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith("image/")) {
            const file = items[i].getAsFile();

            if (file) {
              e.preventDefault();
              insert_image_file(file);

              return;
            }
          }
        }
      }

      if (Capacitor.isNativePlatform()) {
        const html_data = clipboard.getData("text/html");
        const text_data = clipboard.getData("text/plain");

        if (!html_data && !text_data) {
          e.preventDefault();
          const data_url = await read_clipboard_image();

          if (data_url) {
            insert_data_url_image(data_url);
          }

          return;
        }

        e.preventDefault();
        if (html_data) {
          document.execCommand(
            "insertHTML",
            false,
            sanitize_compose_paste(html_data),
          );
        } else if (text_data) {
          document.execCommand("insertText", false, text_data);
        }
        compose.handle_editor_input();

        return;
      }

      compose.handle_editor_paste(e);
    },
    [compose, insert_image_file, insert_data_url_image],
  );

  return {
    image_input_ref,
    handle_image_select,
    handle_paste_with_images,
  };
}
