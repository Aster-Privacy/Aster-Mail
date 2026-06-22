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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div data-testid="modal">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: {
    value: string;
    placeholder?: string;
    onChange: (e: { target: { value: string } }) => void;
  }) => (
    <input
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) =>
        props.onChange({ target: { value: e.currentTarget.value } })
      }
    />
  ),
}));

import { TemplateGalleryModal } from "./template_gallery_modal";
import { RULE_TEMPLATES } from "./rule_templates";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(props: {
  is_open: boolean;
  on_close?: () => void;
  on_select?: (t: { id: string }) => void;
}) {
  act(() => {
    root.render(
      <TemplateGalleryModal
        is_open={props.is_open}
        on_close={props.on_close ?? (() => {})}
        on_select={props.on_select ?? (() => {})}
      />,
    );
  });
}

function type_search(value: string) {
  const input = container.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("TemplateGalleryModal", () => {
  it("renders nothing when closed", () => {
    render({ is_open: false });
    expect(container.querySelector('[data-testid="modal"]')).toBeNull();
  });

  it("renders every template when open", () => {
    render({ is_open: true });
    const text = container.textContent ?? "";
    for (const tpl of RULE_TEMPLATES) {
      expect(text, tpl.id).toContain(tpl.name_key);
    }
  });

  it("filters templates by search query", () => {
    render({ is_open: true });
    type_search("social");
    const text = container.textContent ?? "";
    expect(text).toContain("mail_rules.tpl_social_name");
    expect(text).not.toContain("mail_rules.tpl_newsletters_name");
  });

  it("shows an empty state when nothing matches", () => {
    render({ is_open: true });
    type_search("no-such-template-xyz");
    expect(container.textContent ?? "").toContain("mail_rules.templates_empty");
  });

  it("calls on_select with the chosen template", () => {
    const on_select = vi.fn();
    render({ is_open: true, on_select });
    const card = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("mail_rules.tpl_newsletters_name"),
    ) as HTMLButtonElement;
    expect(card).toBeTruthy();
    act(() => card.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select.mock.calls[0][0].id).toBe("newsletters");
  });
});
