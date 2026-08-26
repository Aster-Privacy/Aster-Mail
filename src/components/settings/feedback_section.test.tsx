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
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  post: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: h.post },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/native/invoke_bridge", () => ({
  is_desktop: () => false,
}));

let container: HTMLDivElement;
let root: Root;

async function mount() {
  const { FeedbackSection } = await import("./feedback_section");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<FeedbackSection />);
  });
}

function type_feedback(text: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function click_label(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;

  button.click();
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    h.post.mockReset();
    h.post.mockResolvedValue({ data: { success: true } });
    h.show_toast.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("sends general feedback when no category is chosen", async () => {
    await mount();

    act(() => {
      type_feedback("the sidebar feels cramped");
    });

    await act(async () => {
      click_label("settings.send_feedback_button");
    });

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post.mock.calls[0][1]).toMatchObject({
      category: "general",
      message: "the sidebar feels cramped",
    });
  });

  it("sends the category the person picked", async () => {
    await mount();

    act(() => {
      type_feedback("search never finds old mail");
      click_label("settings.feedback_category_bug");
    });

    await act(async () => {
      click_label("settings.send_feedback_button");
    });

    expect(h.post.mock.calls[0][1]).toMatchObject({ category: "bug" });
  });

  it("returns to the general category after a successful send", async () => {
    await mount();

    act(() => {
      type_feedback("dark mode could use more contrast");
      click_label("settings.feedback_category_idea");
    });

    await act(async () => {
      click_label("settings.send_feedback_button");
    });

    expect(h.post.mock.calls[0][1]).toMatchObject({ category: "feature" });

    const general = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "settings.feedback_category_general",
    ) as HTMLButtonElement;

    expect(general.getAttribute("aria-pressed")).toBe("true");
  });
});
