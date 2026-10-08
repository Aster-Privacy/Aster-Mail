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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "rich_text" as string | undefined }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { compose_mode: state.mode, strip_exif_on_compose: false },
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (s: string) => s }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

import {
  use_compose_editor,
  type UseComposeEditorReturn,
} from "./use_compose_editor";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let hook: UseComposeEditorReturn;
let root: Root;
let host: HTMLDivElement;

function Probe() {
  const ref = useRef<HTMLDivElement>(null);

  hook = use_compose_editor({
    message_textarea_ref: ref,
    set_message: () => undefined,
    on_files_drop: () => undefined,
  });

  return <div ref={ref} contentEditable suppressContentEditableWarning />;
}

async function open_compose(mode: string | undefined) {
  state.mode = mode;
  await act(async () => root.render(<Probe />));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("compose window format when it opens", () => {
  it.each([undefined, "rich_text"])(
    "starts in rich text when compose mode is %s",
    async (mode) => {
      await open_compose(mode);

      expect(hook.is_plain_text_mode).toBe(false);
    },
  );

  it("starts in plain text when that is the default", async () => {
    await open_compose("plain_text");

    expect(hook.is_plain_text_mode).toBe(true);
  });

  it("still lets the toolbar switch this message to rich text", async () => {
    await open_compose("plain_text");
    await act(async () => hook.toggle_plain_text_mode());

    expect(hook.is_plain_text_mode).toBe(false);
  });
});
