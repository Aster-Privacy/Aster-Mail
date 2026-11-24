//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  copy_text: vi.fn(async (_value: string) => true),
  show_toast: vi.fn(),
  favicon_calls: [] as Array<[string, boolean]>,
  favicon_src: "data:,",
  logos_allowed: true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key} ${Object.values(params).join(" ")}` : key,
  }),
}));

vi.mock("@/utils/copy_text", () => ({
  copy_text: (value: string) => h.copy_text(value),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => h.show_toast(...args),
}));

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: (domain: string, enabled: boolean) => {
    h.favicon_calls.push([domain, enabled]);

    return enabled ? h.favicon_src : "data:,";
  },
}));

vi.mock("@/contexts/sender_logo_context", () => ({
  use_sender_logos_allowed: () => h.logos_allowed,
}));

const { ExternalLinkWarningModal, LONG_ADDRESS_LENGTH } =
  await import("./external_link_warning_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LONG_URL =
  "https://click.example-mail.com/ls/click?upn=u001.abcdefghijklmnopqrstuvwxyz0123456789&utm_source=newsletter&utm_medium=email&utm_campaign=autumn";

interface RenderOptions {
  url?: string;
  link_text?: string;
  lockdown_active?: boolean;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const on_close = vi.fn();
const on_confirm = vi.fn();
const on_dismiss_permanently = vi.fn();

function render(options: RenderOptions = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ExternalLinkWarningModal
        is_open
        link_text={options.link_text}
        lockdown_active={options.lockdown_active}
        url={options.url ?? "https://www.forbes.com/sites/story"}
        on_close={on_close}
        on_confirm={on_confirm}
        on_dismiss_permanently={on_dismiss_permanently}
      />,
    );
  });
}

function q<T extends Element = HTMLElement>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

function button(action: "open" | "cancel"): HTMLButtonElement | null {
  return q<HTMLButtonElement>(`[data-action="${action}"]`);
}

function click(el: Element | null) {
  expect(el).not.toBeNull();
  act(() => {
    (el as HTMLElement).click();
  });
}

function signals(): string[] {
  return Array.from(document.body.querySelectorAll("[data-signal]")).map(
    (el) => el.getAttribute("data-signal") ?? "",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  on_close.mockReset();
  on_confirm.mockReset();
  on_dismiss_permanently.mockReset();
  h.copy_text.mockReset();
  h.copy_text.mockResolvedValue(true);
  h.show_toast.mockReset();
  h.favicon_calls = [];
  h.favicon_src = "data:,";
  h.logos_allowed = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("ExternalLinkWarningModal", () => {
  it("shows the registrable domain as the destination and the host under it", () => {
    render({ url: "https://www.forbes.com/sites/story" });

    expect(q('[data-testid="link_destination_site"]')?.textContent).toBe(
      "forbes.com",
    );
    expect(q('[data-testid="link_destination_host"]')?.textContent).toBe(
      "www.forbes.com",
    );
    expect(q('[data-testid="link_destination_url"]')?.textContent).toBe(
      "https://www.forbes.com/sites/story",
    );
    expect(q('[role="alertdialog"]')?.textContent).toContain(
      "common.link_dialog_title",
    );
  });

  it("labels the dialog and describes it with the warnings", () => {
    render({ url: "http://example.com/" });

    const dialog = q('[role="alertdialog"]')!;
    const described = dialog.getAttribute("aria-describedby") ?? "";
    const warnings = q('[data-testid="link_warnings"]')!;

    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(described.split(" ")).toContain(warnings.id);
    expect(warnings.getAttribute("aria-label")).toBe(
      "common.link_dialog_warnings_label",
    );
  });

  it("shows no warnings for a plain https link", () => {
    render();

    expect(q('[data-testid="link_warnings"]')).toBeNull();
  });

  it("warns about each signal only when it applies", () => {
    render({ url: "http://example.com/" });
    expect(signals()).toEqual(["not_encrypted"]);
    act(() => root?.unmount());

    render({ url: "https://xn--pple-43d.com/" });
    expect(signals()).toEqual(["lookalike"]);
    expect(q('[data-signal="lookalike"]')?.textContent).toContain("аpple.com");
    act(() => root?.unmount());

    render({ url: "https://evil.example/", link_text: "paypal.com" });
    expect(signals()).toEqual(["text_mismatch"]);
    expect(q('[data-signal="text_mismatch"] strong')?.textContent).toBe(
      "paypal.com",
    );
    act(() => root?.unmount());

    render({ url: "https://198.51.100.7/" });
    expect(signals()).toEqual(["ip_address"]);
  });

  it("collapses a long address and expands it on request", () => {
    expect(LONG_URL.length).toBeGreaterThan(LONG_ADDRESS_LENGTH);
    render({ url: LONG_URL });

    const region = q('[data-testid="link_destination_url"]')!;
    const toggle = q<HTMLButtonElement>("[aria-expanded]")!;

    expect(region.getAttribute("data-expanded")).toBe("false");
    expect(region.querySelector("p")?.className).toContain("line-clamp-2");
    expect(toggle.getAttribute("aria-controls")).toBe(region.id);
    expect(toggle.textContent).toBe("common.link_dialog_show_full");

    click(toggle);
    expect(region.getAttribute("data-expanded")).toBe("true");
    expect(region.querySelector("p")?.className).not.toContain("line-clamp-2");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("common.show_less");
    expect(region.textContent).toBe(LONG_URL);

    click(toggle);
    expect(region.getAttribute("data-expanded")).toBe("false");
  });

  it("hides the expand control for a short address", () => {
    render({ url: "https://example.com/a" });

    expect(q("[aria-expanded]")).toBeNull();
  });

  it("copies the exact link and confirms it", async () => {
    render({ url: LONG_URL });

    const copy = q<HTMLButtonElement>("[data-copied]")!;

    await act(async () => {
      copy.click();
    });

    expect(h.copy_text).toHaveBeenCalledWith(LONG_URL);
    expect(copy.getAttribute("data-copied")).toBe("true");
    expect(copy.textContent).toBe("common.copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(copy.getAttribute("data-copied")).toBe("false");
  });

  it("reports a failed copy", async () => {
    h.copy_text.mockResolvedValue(false);
    render();

    await act(async () => {
      q<HTMLButtonElement>("[data-copied]")!.click();
    });

    expect(h.show_toast).toHaveBeenCalledWith("common.failed_to_copy", "error");
    expect(q("[data-copied]")?.getAttribute("data-copied")).toBe("false");
  });

  it("focuses Open link when nothing needs attention", () => {
    render();

    expect(document.activeElement).toBe(button("open"));
  });

  it("focuses Cancel when a warning is shown", () => {
    render({ url: "http://example.com/" });

    expect(document.activeElement).toBe(button("cancel"));
  });

  it("opens with Enter when nothing needs attention", () => {
    render();

    const region = q('[data-testid="link_destination_url"]')!;

    act(() => {
      region.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_confirm).toHaveBeenCalledTimes(1);
  });

  it("does not open with a stray Enter when a warning is shown", () => {
    render({ url: "http://example.com/" });

    act(() => {
      q('[data-testid="link_destination_url"]')!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_confirm).not.toHaveBeenCalled();
  });

  it("cancels with Escape", () => {
    render();

    act(() => {
      q('[role="alertdialog"]')!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_close).toHaveBeenCalledTimes(1);
    expect(on_confirm).not.toHaveBeenCalled();
  });

  it("remembers Don't show again only when the link opens", () => {
    render();

    const checkbox = q<HTMLInputElement>("#external-link-dont-show-checkbox")!;

    click(checkbox);
    expect(checkbox.checked).toBe(true);
    click(button("open"));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_dismiss_permanently).toHaveBeenCalledTimes(1);
    expect(on_confirm).toHaveBeenCalledTimes(1);
  });

  it("does not remember Don't show again on cancel", () => {
    render();

    click(q("#external-link-dont-show-checkbox"));
    click(button("cancel"));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_dismiss_permanently).not.toHaveBeenCalled();
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("offers no way to open a javascript or data link", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi"]) {
      render({ url });

      expect(button("open")).toBeNull();
      expect(q("#external-link-dont-show-checkbox")).toBeNull();
      expect(q("[data-copied]")).toBeNull();
      expect(q('[role="alertdialog"]')?.getAttribute("data-link-kind")).toBe(
        "blocked",
      );
      expect(button("cancel")?.textContent).toBe("common.close");
      act(() => root?.unmount());
      container?.remove();
    }
    root = null;
    container = null;
  });

  it("hides Open link in lockdown", () => {
    render({ lockdown_active: true });

    expect(button("open")).toBeNull();
    expect(q("#external-link-dont-show-checkbox")).toBeNull();
  });

  it("shows the address of a mailto link", () => {
    render({ url: "mailto:ada@example.com?subject=Hi" });

    expect(q('[data-testid="link_destination_site"]')?.textContent).toBe(
      "ada@example.com",
    );
    expect(q('[role="alertdialog"]')?.textContent).toContain(
      "common.link_dialog_mail_title",
    );
  });

  it("shows the proxied site icon for a plain web link", () => {
    h.favicon_src = "blob:favicon";
    render({ url: "https://www.forbes.com/sites/story" });

    expect(h.favicon_calls).toContainEqual(["forbes.com", true]);
    expect(
      q<HTMLImageElement>(
        '[data-testid="link_destination_favicon"]',
      )?.getAttribute("src"),
    ).toBe("blob:favicon");
  });

  it("shows no icon while the proxied icon is unavailable", () => {
    render({ url: "https://www.forbes.com/sites/story" });

    expect(q('[data-testid="link_destination_favicon"]')).toBeNull();
  });

  it("never requests an icon for a link with a warning, an IP host, or with logos off", () => {
    h.favicon_src = "blob:favicon";
    render({ url: "http://deals.example.net/offer" });
    expect(q('[data-testid="link_destination_favicon"]')).toBeNull();
    act(() => root?.unmount());
    container?.remove();

    render({ url: "https://203.0.113.9/download" });
    expect(q('[data-testid="link_destination_favicon"]')).toBeNull();
    act(() => root?.unmount());
    container?.remove();

    h.logos_allowed = false;
    render({ url: "https://www.forbes.com/sites/story" });
    expect(q('[data-testid="link_destination_favicon"]')).toBeNull();
    expect(h.favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });
});
