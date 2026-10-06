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

import { pt } from "@/lib/i18n/translations/pt";

function pt_t(key: string): string {
  const [section, name] = key.split(".");
  const value = (pt as unknown as Record<string, Record<string, unknown>>)[
    section
  ]?.[name];

  return typeof value === "string" ? value : key;
}

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: pt_t, language: "pt" }),
}));
vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_full_datetime: () => "hoje" }),
}));
vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));
vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const { MessageDetailsModal } = await import("./message_details_modal");
const { MobileMessageDetailsSheet } =
  await import("@/pages/mobile/mobile_detail_sheets");

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

function message(content_type?: string, extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    item_type: "received",
    sender_name: "Loja",
    sender_email: "news@shop.example",
    subject: "Olá",
    body: "",
    html_content: "<p>Olá</p>",
    timestamp: "2026-09-30T09:21:00Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    raw_headers: [
      { name: "From", value: "Loja <news@shop.example>" },
      ...(content_type ? [{ name: "Content-Type", value: content_type }] : []),
    ],
    ...extra,
  } as never;
}

function mount(node: React.ReactNode) {
  const container = document.createElement("div");

  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

function render_desktop(msg: never) {
  mount(<MessageDetailsModal is_open message={msg} on_close={() => {}} />);
}

function render_mobile(msg: never) {
  mount(
    <MobileMessageDetailsSheet
      format_detail={() => "hoje"}
      message={msg}
      on_close={() => {}}
      t={pt_t as never}
    />,
  );
}

function format_row(): string | null {
  const label = [...document.querySelectorAll("span")].find(
    (el) => el.textContent === "Formato:",
  );

  return label?.nextElementSibling?.textContent ?? null;
}

const CASES: [string, string][] = [
  ["text/plain; charset=utf-8", "Texto simples"],
  ['multipart/alternative; boundary="b1"', "HTML e texto simples"],
  ["Text/HTML; charset=UTF-8", "HTML"],
];

describe.each([
  ["desktop", render_desktop],
  ["mobile", render_mobile],
])("message details format row (%s)", (_name, render) => {
  it.each(CASES)("shows %s as %s", (content_type, expected) => {
    render(message(content_type));

    expect(format_row()).toBe(expected);
  });

  it("hides the row when the message has no Content-Type header", () => {
    render(message(undefined, { is_external: false }));

    expect(format_row()).toBeNull();
    expect(document.body.textContent).not.toContain("Formato");
  });

  it("hides the row when the top-level type does not say which bodies exist", () => {
    for (const content_type of [
      'multipart/mixed; boundary="m"',
      'multipart/encrypted; protocol="application/pgp-encrypted"',
      'multipart/signed; protocol="application/pgp-signature"',
    ]) {
      render(message(content_type));
      expect(format_row()).toBeNull();
      act(() => root?.unmount());
    }
  });

  it("does not guess from the rendered HTML when headers are missing", () => {
    render(message(undefined, { raw_headers: undefined }));

    expect(format_row()).toBeNull();
  });
});
