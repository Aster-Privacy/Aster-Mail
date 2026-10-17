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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const copy_text_or_throw = vi.fn(() => Promise.resolve());

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("@/utils/copy_text", () => ({ copy_text_or_throw }));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

const { CopyableAddress, RecipientAddress } =
  await import("./copyable_address");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  copy_text_or_throw.mockClear();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });

  return container.querySelector<HTMLElement>("[data-copy-address]")!;
}

describe("CopyableAddress", () => {
  it("renders the address as selectable text outside any button", () => {
    const el = render(
      <CopyableAddress address="josh@example.test">
        josh@example.test
      </CopyableAddress>,
    );

    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("select-text");
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.closest("button")).toBeNull();
  });

  it("copies the address on a plain click", () => {
    const el = render(
      <CopyableAddress address="josh@example.test">Josh</CopyableAddress>,
    );

    act(() => el.click());

    expect(copy_text_or_throw).toHaveBeenCalledWith("josh@example.test");
  });

  it("does not copy when the click ends a text selection", () => {
    const el = render(
      <CopyableAddress address="josh@example.test">
        josh@example.test
      </CopyableAddress>,
    );
    const range = document.createRange();

    range.selectNodeContents(el);
    window.getSelection()!.addRange(range);
    act(() => el.click());

    expect(window.getSelection()!.toString()).toBe("josh@example.test");
    expect(copy_text_or_throw).not.toHaveBeenCalled();
  });

  it("copies from the keyboard through the copy button", () => {
    render(<CopyableAddress address="josh@example.test">Josh</CopyableAddress>);
    const button = container!.querySelector("button")!;

    expect(button.getAttribute("aria-label")).toBe("common.copy_address");
    act(() => button.click());

    expect(copy_text_or_throw).toHaveBeenCalledWith("josh@example.test");
  });
});

describe("RecipientAddress", () => {
  it("shows the name and the full address", () => {
    const el = render(
      <RecipientAddress email="josh@example.test" name="Josh" />,
    );

    expect(el.textContent).toBe("Josh <josh@example.test>");
  });

  it("shows a plain label when there is no address", () => {
    render(<RecipientAddress name="Josh" />);

    expect(container!.querySelector("[data-copy-address]")).toBeNull();
    expect(container!.textContent).toBe("Josh");
  });
});
