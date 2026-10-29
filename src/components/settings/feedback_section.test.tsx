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
import { MemoryRouter } from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  post: vi.fn(),
  show_toast: vi.fn(),
  open_external: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
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

vi.mock("@/utils/open_link", () => ({
  open_external: h.open_external,
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
    root.render(
      <MemoryRouter>
        <FeedbackSection />
      </MemoryRouter>,
    );
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

function click_row(label: string) {
  const row = Array.from(
    container.querySelectorAll<HTMLElement>("button, [role='button'], a"),
  ).find((el) => el.textContent?.includes(label));

  if (!row) throw new Error(`row not found: ${label}`);
  row.click();
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    h.post.mockReset();
    h.post.mockResolvedValue({ data: { success: true } });
    h.show_toast.mockReset();
    h.open_external.mockReset();
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

  it("opens a message to support from the support row", async () => {
    await mount();
    const listener = vi.fn();

    window.addEventListener("aster:open-compose-prefilled", listener);
    act(() => {
      click_row("settings.support_email_label");
    });
    window.removeEventListener("aster:open-compose-prefilled", listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      to: ["hello@astermail.org"],
    });
  });

  it("opens a message to the security team from the security row", async () => {
    await mount();
    const listener = vi.fn();

    window.addEventListener("aster:open-compose-prefilled", listener);
    act(() => {
      click_row("settings.support_security_label");
    });
    window.removeEventListener("aster:open-compose-prefilled", listener);

    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      to: ["security@astermail.org"],
    });
  });

  it("opens the help center and the status page in the browser", async () => {
    await mount();

    act(() => {
      click_row("settings.support_help_label");
      click_row("settings.support_status_label");
    });

    expect(h.open_external.mock.calls.map((c) => c[0])).toEqual([
      "https://astermail.org/help",
      "https://status.astermail.org",
    ]);
  });

  it("shows both support addresses", async () => {
    await mount();

    expect(container.textContent).toContain("hello@astermail.org");
    expect(container.textContent).toContain("security@astermail.org");
  });
});
