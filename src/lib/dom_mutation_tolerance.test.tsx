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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Component, act, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { install_dom_mutation_tolerance } from "./dom_mutation_tolerance";

vi.hoisted(() => {
  Object.defineProperty(document, "createEvent", {
    value: undefined,
    configurable: true,
  });
});

Reflect.deleteProperty(document, "createEvent");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const NOT_A_CHILD = /is not a child of this node/;

class Catcher extends Component<
  { children: ReactNode; caught: Error[] },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.caught.push(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function FloatingTip({ text }: { text: string }) {
  return createPortal(
    <div data-testid="floating_tip" role="tooltip">
      {text}
    </div>,
    document.body,
  );
}

function translate_text_node(text_node: Text) {
  const wrapper = document.createElement("font");
  const inner = document.createElement("font");

  inner.textContent = `${text_node.data} (translated)`;
  wrapper.appendChild(inner);
  text_node.parentNode!.replaceChild(wrapper, text_node);
}

function first_text_node(element: Element): Text {
  const node = Array.from(element.childNodes).find(
    (child) => child.nodeType === 3,
  );

  if (!node) throw new Error("no text node");

  return node as Text;
}

let container: HTMLDivElement;
let root: Root;
let restore_tolerance: (() => void) | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document
    .querySelectorAll('[data-testid="floating_tip"]')
    .forEach((node) => node.remove());
  restore_tolerance?.();
  restore_tolerance = null;
});

function render_tip_tree(caught: Error[], show: boolean) {
  act(() => {
    root.render(
      <Catcher caught={caught}>
        {show ? (
          <section>
            <FloatingTip text="Archive" />
          </section>
        ) : (
          <p>closed</p>
        )}
      </Catcher>,
    );
  });
}

function render_text_tree(caught: Error[], show: boolean, badge: boolean) {
  act(() => {
    root.render(
      <Catcher caught={caught}>
        <p data-testid="row">
          {badge && <b>new</b>}
          {show && "Saved"}
          <span>Inbox</span>
        </p>
      </Catcher>,
    );
  });
}

describe("portal child removed outside React", () => {
  it("throws NotFoundError while unmounting without tolerance", () => {
    const caught: Error[] = [];

    render_tip_tree(caught, true);
    document.querySelector('[data-testid="floating_tip"]')!.remove();
    render_tip_tree(caught, false);

    expect(caught).toHaveLength(1);
    expect(caught[0].message).toMatch(NOT_A_CHILD);
  });

  it("unmounts cleanly with tolerance installed", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const caught: Error[] = [];

    render_tip_tree(caught, true);
    document.querySelector('[data-testid="floating_tip"]')!.remove();
    render_tip_tree(caught, false);

    expect(caught).toEqual([]);
    expect(container.textContent).toBe("closed");
    expect(on_foreign).toHaveBeenCalledWith("remove_detached");
  });

  it("removes and reports a portal child moved elsewhere in the page", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const caught: Error[] = [];
    const elsewhere = document.createElement("aside");

    document.body.appendChild(elsewhere);
    render_tip_tree(caught, true);
    elsewhere.appendChild(
      document.querySelector('[data-testid="floating_tip"]')!,
    );
    render_tip_tree(caught, false);

    expect(caught).toEqual([]);
    expect(elsewhere.childNodes).toHaveLength(0);
    expect(on_foreign).toHaveBeenCalledWith("remove_wrapped");
    elsewhere.remove();
  });

  it("still throws when a portal child was moved out of the page", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const caught: Error[] = [];
    const detached = document.createElement("aside");

    render_tip_tree(caught, true);
    detached.appendChild(
      document.querySelector('[data-testid="floating_tip"]')!,
    );
    render_tip_tree(caught, false);

    expect(caught).toHaveLength(1);
    expect(caught[0].message).toMatch(NOT_A_CHILD);
    expect(detached.childNodes).toHaveLength(1);
    expect(on_foreign).not.toHaveBeenCalled();
  });
});

describe("text node replaced by page translation", () => {
  it("throws NotFoundError on removal without tolerance", () => {
    const caught: Error[] = [];

    render_text_tree(caught, true, false);
    translate_text_node(
      first_text_node(document.querySelector('[data-testid="row"]')!),
    );
    render_text_tree(caught, false, false);

    expect(caught).toHaveLength(1);
    expect(caught[0].message).toMatch(NOT_A_CHILD);
  });

  it("throws NotFoundError on insertion without tolerance", () => {
    const caught: Error[] = [];

    render_text_tree(caught, true, false);
    translate_text_node(
      first_text_node(document.querySelector('[data-testid="row"]')!),
    );
    render_text_tree(caught, true, true);

    expect(caught).toHaveLength(1);
    expect(caught[0].message).toMatch(NOT_A_CHILD);
  });

  it("keeps rendering with tolerance installed", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const caught: Error[] = [];

    render_text_tree(caught, true, false);
    translate_text_node(
      first_text_node(document.querySelector('[data-testid="row"]')!),
    );
    render_text_tree(caught, true, true);
    render_text_tree(caught, false, true);

    expect(caught).toEqual([]);
    const row = document.querySelector('[data-testid="row"]')!;

    expect(row.querySelector("b")?.textContent).toBe("new");
    expect(row.querySelector("span")?.textContent).toBe("Inbox");
    expect(on_foreign).toHaveBeenCalledWith("insert_detached_ref");
    expect(on_foreign).toHaveBeenCalledWith("remove_detached");
  });

  it("keeps rendering when a text node is wrapped in place", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const caught: Error[] = [];

    render_text_tree(caught, true, false);
    const text = first_text_node(
      document.querySelector('[data-testid="row"]')!,
    );
    const wrapper = document.createElement("mark");

    text.parentNode!.replaceChild(wrapper, text);
    wrapper.appendChild(text);
    render_text_tree(caught, true, true);
    render_text_tree(caught, false, true);

    expect(caught).toEqual([]);
    const row = document.querySelector('[data-testid="row"]')!;

    expect(row.firstChild).toBe(row.querySelector("b"));
    expect(row.textContent).toBe("newInbox");
    expect(on_foreign).toHaveBeenCalledWith("insert_wrapped_ref");
    expect(on_foreign).toHaveBeenCalledWith("remove_wrapped");
  });
});

describe("misuse stays visible", () => {
  it("throws when removing a node that belongs to another parent", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const parent = document.createElement("div");
    const other = document.createElement("div");
    const child = document.createElement("span");

    other.appendChild(child);

    expect(() => parent.removeChild(child)).toThrow(NOT_A_CHILD);
    expect(other.firstChild).toBe(child);
    expect(on_foreign).not.toHaveBeenCalled();
  });

  it("throws when inserting before a node in another tree", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const parent = document.createElement("div");
    const other = document.createElement("div");
    const reference = document.createElement("span");
    const node = document.createElement("b");

    other.appendChild(reference);

    expect(() => parent.insertBefore(node, reference)).toThrow(NOT_A_CHILD);
    expect(node.parentNode).toBeNull();
    expect(on_foreign).not.toHaveBeenCalled();
  });

  it("reports a second removal of the same node", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const parent = document.createElement("div");
    const child = document.createElement("span");

    parent.appendChild(child);
    parent.removeChild(child);
    parent.removeChild(child);

    expect(on_foreign).toHaveBeenCalledTimes(1);
    expect(on_foreign).toHaveBeenCalledWith("remove_detached");
  });
});

describe("install_dom_mutation_tolerance", () => {
  it("installs once and restores the original methods", () => {
    const original_remove = Node.prototype.removeChild;
    const original_insert = Node.prototype.insertBefore;

    restore_tolerance = install_dom_mutation_tolerance(() => undefined);
    expect(restore_tolerance).not.toBeNull();
    expect(install_dom_mutation_tolerance(() => undefined)).toBeNull();
    expect(Node.prototype.removeChild).not.toBe(original_remove);

    restore_tolerance!();
    restore_tolerance = null;
    expect(Node.prototype.removeChild).toBe(original_remove);
    expect(Node.prototype.insertBefore).toBe(original_insert);
  });

  it("leaves normal DOM operations unchanged", () => {
    const on_foreign = vi.fn();

    restore_tolerance = install_dom_mutation_tolerance(on_foreign);
    const parent = document.createElement("div");
    const first = document.createElement("i");
    const second = document.createElement("b");

    parent.appendChild(second);
    expect(parent.insertBefore(first, second)).toBe(first);
    expect(parent.firstChild).toBe(first);
    expect(parent.removeChild(second)).toBe(second);
    expect(parent.childNodes).toHaveLength(1);
    expect(on_foreign).not.toHaveBeenCalled();
  });
});

describe("page translation opt out", () => {
  it.each(["index.html", "bridge.html", "session_bridge.html"])(
    "%s opts out of browser page translation",
    (file) => {
      const html = readFileSync(resolve(__dirname, "../..", file), "utf8");

      expect(html).toMatch(/<html[^>]*\stranslate="no"/);
      expect(html).toContain('<meta name="google" content="notranslate" />');
    },
  );
});
