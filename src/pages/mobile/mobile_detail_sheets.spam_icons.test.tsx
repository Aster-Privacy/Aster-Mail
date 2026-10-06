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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const { MobileActionMenuSheet } = await import("./mobile_detail_sheets");
const { NotSpamIcon, ReportSpamIcon } =
  await import("@/components/email/spam_action_icons");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const message = {
  id: "m1",
  item_type: "received",
  sender_name: "Shop",
  sender_email: "news@shop.example",
  subject: "Hi",
  body: "",
  timestamp: "2026-10-01T07:12:00.000Z",
  is_read: true,
  is_starred: false,
  is_deleted: false,
} as DecryptedThreadMessage;

function icon_markup(Icon: Icon): string | undefined {
  const host = document.createElement("div");
  const icon_root = createRoot(host);

  act(() => icon_root.render(<Icon />));
  const markup = host.querySelector("svg")?.innerHTML;

  act(() => icon_root.unmount());

  return markup;
}

function render_sheet(is_spam: boolean): HTMLDivElement {
  const container = document.createElement("div");
  const noop = () => {};

  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MobileActionMenuSheet
        format_detail={() => "today"}
        is_all_dark={false}
        is_message_dark={false}
        is_pinned={false}
        is_spam={is_spam}
        is_starred={false}
        menu_message={message}
        menu_source="message"
        on_archive={noop}
        on_block={noop}
        on_close={noop}
        on_copy_id={noop}
        on_customize_toolbar={noop}
        on_forward={noop}
        on_message_details={noop}
        on_not_spam={noop}
        on_print={noop}
        on_reply={noop}
        on_reply_all={noop}
        on_report_phishing={noop}
        on_snooze={noop}
        on_spam={noop}
        on_toggle_all_dark_mode={noop}
        on_toggle_dark_mode={noop}
        on_toggle_pin={noop}
        on_toggle_read={noop}
        on_toggle_star={noop}
        on_trash={noop}
        on_view_source={noop}
        t={(key) => key}
      />,
    );
  });

  return container;
}

function row_icon(container: HTMLElement, label: string): string | undefined {
  const row = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );

  return row?.querySelector("svg")?.innerHTML;
}

describe("MobileActionMenuSheet spam icons", () => {
  it("uses the shared report spam icon for both report spam rows", () => {
    const container = render_sheet(false);
    const report_icon = icon_markup(ReportSpamIcon);

    expect(row_icon(container, "mail.report_spam")).toBe(report_icon);
    expect(row_icon(container, "common.report_phishing")).toBe(report_icon);
  });

  it("uses the shared not spam icon for the not spam row", () => {
    const container = render_sheet(true);

    expect(row_icon(container, "mail.not_spam")).toBe(icon_markup(NotSpamIcon));
  });
});
