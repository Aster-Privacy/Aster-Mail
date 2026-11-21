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
import { signature_from_editor_html } from "@/lib/signature_html";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Format = ReturnType<typeof use_editor_format>;

describe("removing a highlight in the rich text editor", () => {
  let container: HTMLDivElement;
  let root: Root;
  let format: Format;
  let editor: HTMLDivElement;
  let on_input: ReturnType<typeof vi.fn<() => void>>;
  let original_exec: typeof document.execCommand;

  function Harness() {
    const editor_ref = useRef<HTMLDivElement | null>(null);

    format = use_editor_format(editor_ref, false, on_input);

    return <div ref={editor_ref} contentEditable id="editor" />;
  }

  function select(range_setup: (range: Range) => void): void {
    const range = document.createRange();

    range_setup(range);
    const selection = window.getSelection()!;

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function text_node(element: Element): Text {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    return walker.nextNode() as Text;
  }

  beforeEach(() => {
    on_input = vi.fn<() => void>();
    original_exec = document.execCommand;
    document.execCommand = (() => true) as typeof document.execCommand;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);

      return 0;
    }) as typeof requestAnimationFrame;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
    editor = container.querySelector("#editor") as HTMLDivElement;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.execCommand = original_exec;
    vi.restoreAllMocks();
  });

  it("offers a way to remove a highlight", () => {
    expect(typeof format.remove_background_color).toBe("function");
  });

  it("strips a saved highlight when the whole span is selected", () => {
    editor.innerHTML =
      '<div>Dylan <span style="background-color: rgb(255, 255, 0);">Smith</span></div>';
    const span = editor.querySelector("span")!;

    select((range) => range.selectNodeContents(span));
    act(() => format.remove_background_color());

    expect(editor.innerHTML).toBe("<div>Dylan Smith</div>");
    expect(editor.innerHTML).not.toContain("background");
    expect(on_input).toHaveBeenCalled();
  });

  it("keeps other styles on the span", () => {
    editor.innerHTML =
      '<div><span style="color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">Smith</span></div>';
    const span = editor.querySelector("span")!;

    select((range) => range.selectNodeContents(span));
    act(() => format.remove_background_color());

    const remaining = editor.querySelector("span")!;

    expect(remaining.style.color).toBe("rgb(255, 0, 0)");
    expect(remaining.style.backgroundColor).toBe("");
    expect(remaining.textContent).toBe("Smith");
  });

  it("removes only the selected part of a highlight", () => {
    editor.innerHTML =
      '<div><span style="background-color: #ffff00;"><b>Hello World</b></span></div>';
    const text = text_node(editor);

    select((range) => {
      range.setStart(text, 6);
      range.setEnd(text, 11);
    });
    act(() => format.remove_background_color());

    const highlighted = Array.from(
      editor.querySelectorAll<HTMLElement>("span"),
    ).filter((span) => span.style.backgroundColor !== "");

    expect(editor.textContent).toBe("Hello World");
    expect(highlighted.map((span) => span.textContent)).toEqual(["Hello "]);
    expect(editor.querySelectorAll("b")).toHaveLength(2);
    expect(
      Array.from(editor.querySelectorAll("b")).map((b) => b.textContent),
    ).toEqual(["Hello ", "World"]);
  });

  it("removes the highlight around the caret", () => {
    editor.innerHTML =
      '<div>Call <span style="background-color: #00ff00;">555-0100</span></div>';
    const text = text_node(editor.querySelector("span")!);

    select((range) => {
      range.setStart(text, 3);
      range.collapse(true);
    });
    act(() => format.remove_background_color());

    expect(editor.innerHTML).toBe("<div>Call 555-0100</div>");
  });

  it("clears highlights across several lines and leaves a clean signature", () => {
    editor.innerHTML =
      '<div><span style="background-color: #ff0;">Dylan</span></div>' +
      '<div><span style="background: #0ff;">Support</span> team</div>';

    select((range) => range.selectNodeContents(editor));
    act(() => format.remove_background_color());

    const saved = signature_from_editor_html(editor.innerHTML);

    expect(saved.content).not.toMatch(/background/i);
    expect(editor.textContent).toBe("DylanSupport team");
  });

  it("does not touch highlights outside the selection", () => {
    editor.innerHTML =
      '<div><span style="background-color: #ff0;">Keep</span> <span style="background-color: #f0f;">Drop</span></div>';
    const drop = editor.querySelectorAll("span")[1];

    select((range) => range.selectNodeContents(drop));
    act(() => format.remove_background_color());

    expect(editor.innerHTML).toBe(
      '<div><span style="background-color: #ff0;">Keep</span> Drop</div>',
    );
  });
});
