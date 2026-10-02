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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const native = vi.hoisted(() => ({ is_native: false }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.is_native },
}));

vi.mock("@/native/clipboard_image", () => ({
  read_clipboard_image: vi.fn(() => Promise.resolve(null)),
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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXCEL_HTML =
  "<html><body><!--StartFragment--><table><tr><td>Region</td><td>Total</td></tr>" +
  "<tr><td>North</td><td>42</td></tr></table><!--EndFragment--></body></html>";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let paste: ReturnType<typeof use_mobile_compose_images> | null = null;

const compose = {
  message_textarea_ref: { current: null as HTMLDivElement | null },
  handle_editor_input: vi.fn(),
  handle_editor_paste: vi.fn(),
  handle_file_select: vi.fn(),
  handle_files_drop: vi.fn(() => Promise.resolve()),
};

function Harness() {
  paste = use_mobile_compose_images(compose);

  return (
    <div
      ref={compose.message_textarea_ref}
      contentEditable
      suppressContentEditableWarning
    />
  );
}

function clipboard_event(data: Record<string, string>, image: File | null) {
  const items = image
    ? [{ kind: "file", type: image.type, getAsFile: () => image }]
    : [];

  return {
    clipboardData: {
      getData: (type: string) => data[type] ?? "",
      files: image ? [image] : [],
      items,
    },
    preventDefault: vi.fn(),
  } as unknown as React.ClipboardEvent<HTMLDivElement>;
}

function png_file(): File {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);

  return new File([bytes], "image.png", { type: "image/png" });
}

beforeEach(async () => {
  native.is_native = false;
  compose.handle_editor_input.mockClear();
  compose.handle_editor_paste.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  paste = null;
});

describe("pasting into the mobile composer", () => {
  it("pastes spreadsheet cells as a table, not as a picture of them", async () => {
    const event = clipboard_event(
      { "text/html": EXCEL_HTML, "text/plain": "Region\tTotal\nNorth\t42\n" },
      png_file(),
    );

    await act(async () => paste!.handle_paste_with_images(event));

    expect(compose.handle_editor_paste).toHaveBeenCalledWith(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("pastes a copied image as an image", async () => {
    const event = clipboard_event({}, png_file());

    await act(async () => paste!.handle_paste_with_images(event));

    expect(compose.handle_editor_paste).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("pastes an image whose HTML has no text as an image", async () => {
    const event = clipboard_event(
      { "text/html": '<img src="https://example.com/a.png">' },
      png_file(),
    );

    await act(async () => paste!.handle_paste_with_images(event));

    expect(compose.handle_editor_paste).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("pastes spreadsheet cells as a table in the app too", async () => {
    native.is_native = true;
    const event = clipboard_event(
      { "text/html": EXCEL_HTML, "text/plain": "Region\tTotal\nNorth\t42\n" },
      png_file(),
    );

    await act(async () => paste!.handle_paste_with_images(event));

    expect(compose.handle_editor_paste).toHaveBeenCalledWith(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
