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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_thread_draft_removal } from "./use_thread_draft_removal";

import { MAIL_EVENTS } from "@/hooks/mail_events";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe({
  thread_token,
  on_clear,
}: {
  thread_token: string;
  on_clear: (draft: unknown) => void;
}) {
  use_thread_draft_removal(thread_token, on_clear);

  return null;
}

function dispatch_change(thread_token: string, draft: unknown) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.THREAD_DRAFT_CHANGED, {
        detail: { thread_token, draft },
      }),
    );
  });
}

describe("use_thread_draft_removal", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("clears the open thread's draft when the draft is deleted", () => {
    const on_clear = vi.fn();

    act(() => root!.render(<Probe on_clear={on_clear} thread_token="t1" />));
    dispatch_change("t1", null);

    expect(on_clear).toHaveBeenCalledWith(null);
  });

  it("ignores deletions on other threads and saved drafts", () => {
    const on_clear = vi.fn();

    act(() => root!.render(<Probe on_clear={on_clear} thread_token="t1" />));
    dispatch_change("t2", null);
    dispatch_change("t1", { id: "d1" });

    expect(on_clear).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    const on_clear = vi.fn();

    act(() => root!.render(<Probe on_clear={on_clear} thread_token="t1" />));
    act(() => root!.unmount());
    root = null;
    dispatch_change("t1", null);

    expect(on_clear).not.toHaveBeenCalled();
  });
});
