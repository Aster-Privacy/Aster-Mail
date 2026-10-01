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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";

const insert_text = vi.fn();
const insert_html = vi.fn();
const compose_mode = { current: "plain_text" };

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      compose_mode: compose_mode.current,
      strip_exif_on_compose: false,
    },
  }),
}));
vi.mock("@/hooks/use_editor", () => ({
  use_editor: () => ({ insert_text, insert_html }),
}));
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

function Probe() {
  hook = use_compose_editor({
    message_textarea_ref: { current: null },
    set_message: () => {},
    on_files_drop: () => {},
    get_recipient_name: () => "Ada",
  });

  return null;
}
async function mount(mode: string) {
  compose_mode.current = mode;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  insert_text.mockClear();
  insert_html.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("inserts a template as text when composing in plain text", async () => {
  await mount("plain_text");
  hook.handle_template_select("Hi [Name],\n<b>thanks</b>");
  expect(insert_text).toHaveBeenCalledWith("Hi Ada,\n<b>thanks</b>");
  expect(insert_html).not.toHaveBeenCalled();
});
it("inserts a template as escaped markup when composing in rich text", async () => {
  await mount("rich_text");
  hook.handle_template_select("Hi [Name],\n<b>thanks</b>");
  expect(insert_html).toHaveBeenCalledWith(
    "<div>Hi Ada,<br>&lt;b&gt;thanks&lt;/b&gt;</div>",
  );
  expect(insert_text).not.toHaveBeenCalled();
});
