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

const copy_text_or_throw = vi.fn((_text: string) => Promise.resolve());
const trigger_download = vi.fn((_blob: Blob, _name: string) => {});

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}(${Object.values(params).join(",")})` : key,
    language: "en",
  }),
}));
vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_full_datetime: () => "today" }),
}));
vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));
vi.mock("@/utils/copy_text", () => ({ copy_text_or_throw }));
vi.mock("@/utils/download_blob", () => ({ trigger_download }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const { MessageDetailsModal } = await import("./message_details_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  copy_text_or_throw.mockClear();
  trigger_download.mockClear();
});

const LONG_RECEIVED =
  "from mail-out-7.shop.example (mail-out-7.shop.example [192.0.2.25])\r\n\tby mx.example.org with ESMTPS id 4AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWxYz for <alex@example.org>; Wed, 30 Sep 2026 09:21:04 +0000";

const HEADERS = [
  { name: "Return-Path", value: "<bounce@mail.shop.example>" },
  {
    name: "Authentication-Results",
    value: "stalwart.internal; dkim=fail (body hash did not verify)",
  },
  { name: "Received", value: LONG_RECEIVED },
  {
    name: "Authentication-Results",
    value: "mx.example.org; dkim=pass header.d=shop.example; spf=pass",
  },
  {
    name: "ARC-Seal",
    value: `i=1; a=rsa-sha256; cv=none; b=${"Q".repeat(400)}`,
  },
  { name: "DKIM-Signature", value: "v=1; d=shop.example; b=abc" },
  {
    name: "X-Evil",
    value: '<script>alert(1)</script><img src=x onerror="alert(2)">',
  },
  { name: "From", value: "Shop <news@shop.example>" },
];

function render(results: Record<string, string>, headers = HEADERS) {
  const container = document.createElement("div");

  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MessageDetailsModal
        is_open
        message={
          {
            id: "m1",
            item_type: "received",
            sender_name: "Shop",
            sender_email: "news@shop.example",
            subject: "Hi",
            body: "",
            timestamp: "2026-09-30T09:21:00Z",
            is_read: true,
            is_starred: false,
            is_deleted: false,
            is_external: true,
            raw_headers: headers,
            ...results,
          } as never
        }
        on_close={() => {}}
      />,
    );
  });
}

const pills = () =>
  [...document.querySelectorAll<HTMLElement>("button[data-check]")].map(
    (pill) => [
      pill.dataset.check,
      pill.querySelector<HTMLElement>("[data-status]")?.dataset.status,
    ],
  );
const summary = () =>
  document.querySelector<HTMLElement>("[data-auth-summary]")?.dataset
    .authSummary;
const box = () =>
  document.querySelector<HTMLElement>('[data-testid="message-headers"]')!;
const raw = HEADERS.map((h) => `${h.name}: ${h.value}`).join("\n");

describe("MessageDetailsModal authentication", () => {
  it("shows a pill per check from the results recorded on arrival", () => {
    render({ spf_result: "pass", dkim_result: "pass", dmarc_result: "pass" });

    expect(pills()).toEqual([
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
    ]);
    expect(summary()).toBe("authenticated");
    expect(document.body.textContent).toContain(
      "mail.email_auth_summary_authenticated(shop.example)",
    );
  });

  it("ignores Authentication-Results headers that disagree with the recorded results", () => {
    render({ spf_result: "pass", dkim_result: "pass", dmarc_result: "pass" });

    expect(pills().find(([check]) => check === "dkim")?.[1]).toBe("pass");
  });

  it("shows failures and the failed summary", () => {
    render({ spf_result: "fail", dkim_result: "none", dmarc_result: "fail" });

    expect(pills()).toEqual([
      ["spf", "fail"],
      ["dkim", "none"],
      ["dmarc", "fail"],
    ]);
    expect(summary()).toBe("failed");
  });

  it("follows the shared verdict rules for mixed results", () => {
    render({ spf_result: "fail", dkim_result: "pass", dmarc_result: "pass" });

    expect(summary()).toBe("authenticated");
  });

  it("calls unusual results inconclusive", () => {
    render({
      spf_result: "softfail",
      dkim_result: "none",
      dmarc_result: "none",
    });

    expect(pills()[0]).toEqual(["spf", "other"]);
    expect(summary()).toBe("partial");
  });

  it("says when no results were recorded", () => {
    render({});

    expect(pills()).toEqual([]);
    expect(summary()).toBe("unavailable");
  });

  it("names the DKIM signer and the Return-Path domain", () => {
    render({ spf_result: "pass", dkim_result: "pass", dmarc_result: "pass" });

    expect(document.body.textContent).toContain("mail.signed_by_label");
    expect(document.body.textContent).toContain("mail.mailed_by_label");
    expect(document.body.textContent).toContain("mail.shop.example");
  });

  it("leaves out the Return-Path domain when SPF failed", () => {
    render({ spf_result: "fail", dkim_result: "pass", dmarc_result: "pass" });

    expect(document.body.textContent).not.toContain("mail.mailed_by_label");
  });

  it("explains a pill in a labelled popover", () => {
    render({ spf_result: "pass", dkim_result: "fail", dmarc_result: "pass" });
    const dkim = document.querySelector<HTMLButtonElement>(
      'button[data-check="dkim"]',
    )!;

    act(() => dkim.click());
    const dialogs =
      document.querySelectorAll<HTMLElement>("[aria-describedby]");
    const dialog = dialogs[dialogs.length - 1];
    const desc = document.getElementById(
      dialog.getAttribute("aria-describedby")!,
    );

    expect(desc?.textContent).toBe("mail.email_auth_dkim_fail");
  });
});

describe("MessageDetailsModal headers", () => {
  it("wraps long lines with a hanging indent instead of scrolling sideways", () => {
    render({});
    const el = box();

    expect(el.className).toContain("whitespace-pre-wrap");
    expect(el.className).toContain("[overflow-wrap:anywhere]");
    expect(el.className).toContain("overflow-x-hidden");
    expect(el.querySelector("[data-header-line]")?.className).toContain(
      "-indent-[2ch]",
    );
  });

  it("renders header values as text, never as HTML", () => {
    render({});

    expect(box().querySelector("script, img")).toBeNull();
    expect(box().textContent).toContain("<script>alert(1)</script>");
    act(() =>
      document
        .querySelectorAll<HTMLButtonElement>("button[aria-pressed]")[1]
        .click(),
    );
    expect(box().dataset.headersMode).toBe("raw");
    expect(box().querySelector("script, img")).toBeNull();
    expect(box().textContent).toBe(raw.replace(/\n/g, ""));
  });

  it("copies and downloads the exact raw headers", async () => {
    render({});
    const buttons = [...document.querySelectorAll("button")];

    act(() =>
      buttons.find((b) => b.textContent === "mail.copy_headers")!.click(),
    );
    act(() =>
      buttons.find((b) => b.textContent === "mail.download_headers")!.click(),
    );

    expect(copy_text_or_throw).toHaveBeenCalledWith(raw);
    const blob = trigger_download.mock.calls[0][0];

    expect(await blob.text()).toBe(raw);
  });
});
