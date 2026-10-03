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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

const native = vi.hoisted(() => ({ is_native: true }));
const clipboard_image = vi.hoisted(() => ({
  read: vi.fn(() => Promise.resolve(null as string | null)),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.is_native },
}));

vi.mock("@/native/clipboard_image", () => ({
  read_clipboard_image: clipboard_image.read,
  read_clipboard_uri: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { strip_exif_on_compose: false } }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

const { use_mobile_compose_images } =
  await import("./use_mobile_compose_images");
const { use_editor } = await import("@/hooks/use_editor");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REMOTE_SRC = "https://example.com/chart.png";
const PROXIED_SRC = `/api/images/v1/proxy?url=${encodeURIComponent(REMOTE_SRC)}`;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let paste: ReturnType<typeof use_mobile_compose_images> | null = null;
let plain_text_mode = false;
let exec_command: ReturnType<typeof vi.fn>;

function Harness() {
  const editor_ref = useRef<HTMLDivElement | null>(null);
  const editor = use_editor({
    editor_ref,
    enable_rich_paste: !plain_text_mode,
    is_plain_text_mode: plain_text_mode,
  });

  paste = use_mobile_compose_images({
    message_textarea_ref: editor_ref,
    handle_editor_input: vi.fn(),
    handle_editor_paste: editor.handle_paste,
    handle_file_select: vi.fn(),
    handle_files_drop: vi.fn(() => Promise.resolve()),
  });

  return (
    <div ref={editor_ref} contentEditable suppressContentEditableWarning />
  );
}

function clipboard_event(data: Record<string, string>) {
  return {
    clipboardData: {
      getData: (type: string) => data[type] ?? "",
      files: [],
      items: [],
    },
    preventDefault: vi.fn(),
  } as unknown as React.ClipboardEvent<HTMLDivElement>;
}

function inserted_html(): string {
  return exec_command.mock.calls
    .filter(([command]) => command === "insertHTML")
    .map(([, , value]) => String(value))
    .join("");
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
}

beforeEach(async () => {
  native.is_native = true;
  plain_text_mode = false;
  clipboard_image.read.mockClear();
  exec_command = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: exec_command,
  });
  await mount();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  paste = null;
});

describe("pasting remote images into the mobile composer app", () => {
  it("routes pasted images with no text through the image proxy", async () => {
    const event = clipboard_event({
      "text/html": `<img src="${REMOTE_SRC}">`,
    });

    await act(async () => paste!.handle_paste_with_images(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(inserted_html()).toContain(PROXIED_SRC);
    expect(inserted_html()).not.toContain(`src="${REMOTE_SRC}"`);
  });

  it("routes a tracking pixel in a pasted newsletter through the image proxy", async () => {
    const event = clipboard_event({
      "text/html": `<p>Weekly update</p><img src="${REMOTE_SRC}" width="1" height="1">`,
      "text/plain": "Weekly update",
    });

    await act(async () => paste!.handle_paste_with_images(event));

    expect(inserted_html()).toContain("Weekly update");
    expect(inserted_html()).toContain(PROXIED_SRC);
    expect(inserted_html()).not.toContain(`src="${REMOTE_SRC}"`);
  });

  it("keeps the same result in the mobile web composer", async () => {
    native.is_native = false;
    const event = clipboard_event({
      "text/html": `<img src="${REMOTE_SRC}">`,
    });

    await act(async () => paste!.handle_paste_with_images(event));

    expect(inserted_html()).toContain(PROXIED_SRC);
    expect(inserted_html()).not.toContain(`src="${REMOTE_SRC}"`);
  });

  it("pastes plain text in plain text mode instead of HTML", async () => {
    await act(async () => root?.unmount());
    container?.remove();
    plain_text_mode = true;
    await mount();
    const event = clipboard_event({
      "text/html": `<b>Bold</b><img src="${REMOTE_SRC}">`,
      "text/plain": "Bold",
    });

    await act(async () => paste!.handle_paste_with_images(event));

    expect(inserted_html()).toBe("");
    expect(exec_command).toHaveBeenCalledWith("insertText", false, "Bold");
  });

  it("pastes plain text in the app", async () => {
    const event = clipboard_event({ "text/plain": "Hello there" });

    await act(async () => paste!.handle_paste_with_images(event));

    expect(exec_command).toHaveBeenCalledWith(
      "insertText",
      false,
      "Hello there",
    );
    expect(clipboard_image.read).not.toHaveBeenCalled();
  });

  it("reads the native clipboard image when the paste carries no data", async () => {
    const event = clipboard_event({});

    await act(async () => paste!.handle_paste_with_images(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(clipboard_image.read).toHaveBeenCalledTimes(1);
    expect(exec_command).not.toHaveBeenCalled();
  });
});
