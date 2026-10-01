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
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "plain_text" }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { compose_mode: state.mode, strip_exif_on_compose: false },
  }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (s: string) => s }),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/utils/date_format", () => ({
  app_locale: () => "en-US",
  get_display_time_zone: () => "UTC",
}));
import {
  use_compose_editor,
  type UseComposeEditorReturn,
} from "./use_compose_editor";
let hook: UseComposeEditorReturn;
let root: Root;
let editor: HTMLDivElement;
const changed = vi.fn();
function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  hook = use_compose_editor({
    message_textarea_ref: ref,
    set_message: changed,
    on_files_drop: () => {},
    get_recipient_name: () => "A & B",
  });
  return <div contentEditable ref={ref} data-editor="yes" />;
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  changed.mockClear();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string, _: boolean, value: string) => {
      if (command === "insertHTML")
        editor.insertAdjacentHTML("beforeend", value);
      if (command === "insertText")
        editor.append(document.createTextNode(value));
      return true;
    }),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});
async function select(mode: string) {
  state.mode = mode;
  await act(async () => root.render(<Probe />));
  editor = document.querySelector("[data-editor]")!;
  await act(async () => hook.handle_template_select("Hello colleague"));
}
it("inserts a template in rich-text mode", async () => {
  await select("rich_text");
  expect(editor.textContent).toContain("Hello colleague");
  expect(changed).toHaveBeenCalled();
});
it("inserts a template in plain-text mode", async () => {
  await select("plain_text");
  expect(editor.textContent).toContain("Hello colleague");
  expect(changed).toHaveBeenCalled();
});

it("inserts plain-text substitutions and markup literally", async () => {
  state.mode = "plain_text";
  await act(async () => root.render(<Probe />));
  editor = document.querySelector("[data-editor]")!;
  await act(async () =>
    hook.handle_template_select("Hello [Name]\n<check> & review"),
  );
  expect(editor.textContent).toBe("Hello A & B\n<check> & review");
  expect(editor.querySelector("check")).toBeNull();
});
