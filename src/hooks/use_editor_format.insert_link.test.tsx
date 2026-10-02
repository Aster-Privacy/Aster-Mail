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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_editor_format } from "@/hooks/use_editor_format";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type InsertLink = (url: string, text?: string) => void;

describe("insert_link href encoding", () => {
  let container: HTMLDivElement;
  let root: Root;
  let insert_link: InsertLink;
  let exec_calls: Array<[string, string | undefined]>;
  let original_exec: typeof document.execCommand;

  function Harness() {
    const editor_ref = useRef<HTMLDivElement | null>(null);
    const format = use_editor_format(editor_ref, false, () => {});

    insert_link = format.insert_link;

    return <div ref={editor_ref} contentEditable />;
  }

  function inserted_href(): string | null {
    const call = exec_calls.find(([command]) => command === "insertHTML");

    if (!call) return null;
    const host = document.createElement("div");

    host.innerHTML = call[1] ?? "";

    return host.querySelector("a")?.getAttribute("href") ?? null;
  }

  beforeEach(() => {
    exec_calls = [];
    original_exec = document.execCommand;
    document.execCommand = ((
      command: string,
      _ui?: boolean,
      value?: string,
    ) => {
      exec_calls.push([command, value]);

      return true;
    }) as typeof document.execCommand;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);

      return 0;
    }) as typeof requestAnimationFrame;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.execCommand = original_exec;
    vi.restoreAllMocks();
  });

  it("keeps the escapes of a Teams meeting link intact", () => {
    const url =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZjE2%40thread.v2/0?context=%7b%22Tid%22%3a%22abc%22%7d";

    act(() => insert_link(url, "Join"));

    expect(inserted_href()).toBe(url);
  });

  it("encodes spaces and non-ASCII exactly once", () => {
    act(() =>
      insert_link("https://example.com/Shared Documents/café%20menu.pdf", "x"),
    );

    expect(inserted_href()).toBe(
      "https://example.com/Shared%20Documents/caf%C3%A9%20menu.pdf",
    );
  });

  it("encodes a stray percent sign next to valid escapes", () => {
    act(() =>
      insert_link("https://example.com/search?q=100%&r=a%20b&s=%zz%4", "x"),
    );

    expect(inserted_href()).toBe(
      "https://example.com/search?q=100%25&r=a%20b&s=%25zz%254",
    );
  });

  it("keeps quotes and angle brackets out of the attribute", () => {
    act(() => insert_link('https://example.com/a"b<c>', "x"));

    expect(inserted_href()).toBe("https://example.com/a%22b%3Cc%3E");
  });

  it("keeps an ampersand in the query from being read as an entity", () => {
    act(() => insert_link("https://example.com/?a=1&lt;b=2", "x"));

    expect(inserted_href()).toBe("https://example.com/?a=1&lt;b=2");
  });

  it("passes the same href to createLink for a selection", () => {
    const editor = container.querySelector("div") as HTMLDivElement;

    editor.textContent = "Join";
    const range = document.createRange();

    range.selectNodeContents(editor);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    act(() => insert_link("https://teams.microsoft.com/l/19%3ameeting%40x"));

    const call = exec_calls.find(([command]) => command === "createLink");

    expect(call?.[1]).toBe("https://teams.microsoft.com/l/19%3ameeting%40x");
  });

  it("still rejects script and data schemes", () => {
    act(() => insert_link("javascript:alert(1)", "x"));
    act(() => insert_link("JAVASCRIPT:alert(1)", "x"));
    act(() => insert_link("data:text/html,<script>1</script>", "x"));

    expect(exec_calls.some(([command]) => command === "insertHTML")).toBe(
      false,
    );
    expect(exec_calls.some(([command]) => command === "createLink")).toBe(
      false,
    );
  });
});
