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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));
vi.mock("@/utils/copy_text", () => ({ copy_text_or_throw }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const { MobileMessageDetailsSheet } = await import("./mobile_detail_sheets");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const HEADERS = [
  {
    name: "Received",
    value: `from a.example\r\n\tby mx.example.org id ${"x".repeat(300)}`,
  },
  { name: "Message-ID", value: "<abc@shop.example>" },
];

describe("MobileMessageDetailsSheet", () => {
  it("matches the desktop details: pills, real Message-ID, wrapped headers, exact copy", () => {
    const container = document.createElement("div");

    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <MobileMessageDetailsSheet
          format_detail={() => "today"}
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
              raw_headers: HEADERS,
              spf_result: "pass",
              dkim_result: "fail",
              dmarc_result: "none",
            } as never
          }
          on_close={() => {}}
          t={(key) => key}
        />,
      );
    });

    expect(
      [...document.querySelectorAll<HTMLElement>("button[data-check]")].map(
        (pill) =>
          pill.querySelector<HTMLElement>("[data-status]")?.dataset.status,
      ),
    ).toEqual(["pass", "fail", "none"]);
    expect(document.body.textContent).toContain("<abc@shop.example>");
    expect(document.body.textContent).not.toContain("m1@astermail.org");

    const box = document.querySelector<HTMLElement>(
      '[data-testid="message-headers"]',
    )!;

    expect(box.className).toContain("whitespace-pre-wrap");
    expect(box.className).toContain("[overflow-wrap:anywhere]");
    expect(box.className).not.toMatch(/(^|\s)max-h-/);

    act(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "mail.copy_headers")!
        .click(),
    );
    expect(copy_text_or_throw).toHaveBeenCalledWith(
      HEADERS.map((h) => `${h.name}: ${h.value}`).join("\n"),
    );
  });
});
