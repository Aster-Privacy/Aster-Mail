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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}(${Object.values(params).join(",")})` : key,
    language: "en",
  }),
}));

const { EmailAuthIndicator } = await import("./email_auth_indicator");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const passed = {
  spf_result: "pass",
  dkim_result: "pass",
  dmarc_result: "pass",
};

const failed = {
  spf_result: "fail",
  dkim_result: "none",
  dmarc_result: "fail",
};

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
});

function render(
  node: React.ReactNode,
  parent = { click: () => {}, key: () => {} },
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div role="presentation" onClick={parent.click} onKeyDown={parent.key}>
        {node}
      </div>,
    );
  });
}

function trigger(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("button[data-verdict]");
}

function open_popover() {
  act(() => {
    trigger()!.click();
  });
}

function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

describe("EmailAuthIndicator", () => {
  it("renders nothing without results or without a sender domain", () => {
    render(<EmailAuthIndicator results={{}} sender_email="a@shop.test" />);
    expect(trigger()).toBeNull();

    act(() => {
      root!.render(<EmailAuthIndicator results={failed} sender_email="" />);
    });
    expect(trigger()).toBeNull();
  });

  it("shows a badge only when checks failed or were inconclusive", () => {
    const cases: [Record<string, string>, string | null, string | null][] = [
      [passed, null, null],
      [{ spf_result: "pass", dmarc_result: "none" }, null, null],
      [{ spf_result: "softfail" }, "partial", "amber"],
      [{ spf_result: "fail", dmarc_result: "fail" }, "failed", "red"],
    ];
    const icons = new Set<string>();

    for (const [results, verdict, color] of cases) {
      render(
        <EmailAuthIndicator results={results} sender_email="news@shop.test" />,
      );

      if (!verdict) {
        expect(trigger()).toBeNull();
      } else {
        const badge = trigger()?.querySelector(".aster_badge");
        const icon = badge?.querySelector("svg");

        expect(trigger()?.dataset.verdict).toBe(verdict);
        expect(badge?.classList.contains(`aster_badge_${color}`)).toBe(true);
        expect(badge?.textContent).toBe(`mail.email_auth_${verdict}`);
        expect(icon?.getAttribute("aria-hidden")).toBe("true");
        icons.add(icon?.innerHTML ?? "");
        expect(trigger()?.getAttribute("aria-label")).toBe(
          `mail.email_auth_label(mail.email_auth_${verdict})`,
        );
      }
      act(() => {
        root!.unmount();
      });
      container!.remove();
      root = null;
    }
    expect(icons.size).toBe(2);
  });

  it("names the popover and shows the domain isolated and in ASCII", () => {
    render(
      <EmailAuthIndicator
        results={failed}
        sender_email={"billing@\u202eexämple.com"}
      />,
    );
    open_popover();

    const dialog = document.querySelector<HTMLElement>("[aria-labelledby]")!;
    const title = document.getElementById(
      dialog.getAttribute("aria-labelledby")!,
    );
    const desc = document.getElementById(
      dialog.getAttribute("aria-describedby")!,
    );

    expect(title?.textContent).toBe("mail.email_auth_failed");
    expect(desc?.querySelector("bdi")?.textContent).toBe("xn--exmple-cua.com");
    expect(document.activeElement).toBe(dialog);
  });

  it("hides the badge when the From domain could not be a host name", () => {
    for (const sender_email of [
      "billing@paypal.com/\u00fc.evil.com",
      "billing@paypal.com?\u00fc.evil.com",
      "billing@paypal.com:443",
      "billing@pay pal.com",
      "billing@paypal.com\u200d",
      "billing@" + "a.".repeat(5000) + "com",
    ]) {
      render(
        <EmailAuthIndicator results={failed} sender_email={sender_email} />,
      );
      expect(trigger()).toBeNull();
      act(() => {
        root!.unmount();
      });
      container!.remove();
      root = null;
    }
  });

  it("folds capitals of other scripts the way DNS does", () => {
    render(
      <EmailAuthIndicator
        results={failed}
        sender_email={"billing@\u0391\u0392\u03a3-x.gr"}
      />,
    );
    open_popover();

    // A plain sigma, not the final form JavaScript would lower-case it to,
    // so the web and the Android app show the same domain.
    expect(document.querySelector("bdi")?.textContent).toBe("xn---x-b9be9f.gr");
  });

  it("strips every bidi control and keeps the domain left to right", () => {
    render(
      <EmailAuthIndicator
        results={failed}
        sender_email={"billing@\u061cpaypal.com\u061c.evil.com"}
      />,
    );
    open_popover();

    const domain = document.querySelector("bdi");

    expect(domain?.textContent).toBe("paypal.com.evil.com");
    expect(domain?.getAttribute("dir")).toBe("ltr");
  });

  it("colours each check by its own result", () => {
    render(
      <EmailAuthIndicator
        results={{
          spf_result: "fail",
          dkim_result: "pass",
          dmarc_result: "none",
        }}
        sender_email="news@shop.test"
      />,
    );
    open_popover();

    const rows = [
      ...document.querySelectorAll<HTMLElement>("li[data-check]"),
    ].map((row) => {
      const status = row.querySelector<HTMLElement>("[data-status]")!;

      return [row.dataset.check, status.textContent, status.style.color];
    });

    expect(rows).toEqual([
      ["spf", "mail.email_auth_status_fail", "var(--cat-rose-fg)"],
      ["dkim", "mail.email_auth_status_pass", "var(--cat-green-fg)"],
      ["dmarc", "mail.email_auth_status_none", "var(--text-secondary)"],
    ]);
  });

  it("shows unusual values as sent", () => {
    render(
      <EmailAuthIndicator
        results={{ spf_result: "softfail" }}
        sender_email="news@shop.test"
      />,
    );
    open_popover();

    expect(
      document.querySelector('li[data-check="spf"] [data-status]')?.textContent,
    ).toBe("SOFTFAIL");
  });

  it("keeps clicks and keys away from the message header", () => {
    const parent = { click: vi.fn(), key: vi.fn() };

    render(
      <EmailAuthIndicator results={failed} sender_email="a@shop.test" />,
      parent,
    );
    press(trigger()!, "Enter");
    open_popover();
    act(() => {
      document.querySelector<HTMLElement>("li[data-check]")!.click();
    });

    expect(parent.click).not.toHaveBeenCalled();
    expect(parent.key).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("mail.message_details");
  });

  it("opens the message details once focus is back on the badge", async () => {
    const parent = { click: vi.fn(), key: vi.fn() };
    let focused_on_open: Element | null = null;
    const show_details = vi.fn(() => {
      focused_on_open = document.activeElement;
    });

    render(
      <EmailAuthIndicator
        on_show_details={show_details}
        results={failed}
        sender_email="a@shop.test"
      />,
      parent,
    );
    open_popover();

    const details = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "mail.message_details",
    )!;

    press(details, "Enter");
    expect(parent.key).not.toHaveBeenCalled();

    act(() => {
      details.click();
    });
    expect(document.querySelector("li[data-check]")).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(show_details).toHaveBeenCalledTimes(1);
    expect(focused_on_open).toBe(trigger());
    expect(parent.click).not.toHaveBeenCalled();
  });
});
