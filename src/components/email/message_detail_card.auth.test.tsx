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
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

const { MessageDetailCard } = await import("./message_detail_card");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function render(auth_results: Record<string, string> | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MessageDetailCard
        auth_results={auth_results}
        date_label="Today"
        sender_email="news@shop.test"
        sender_name="Shop"
        subject="Hello"
      />,
    );
  });
}

function checks() {
  return [...container!.querySelectorAll<HTMLElement>("[data-check]")].map(
    (row) => [
      row.dataset.check,
      row.querySelector<HTMLElement>("[data-status]")?.dataset.status,
    ],
  );
}

describe("MessageDetailCard authentication row", () => {
  it("lists the checks of a message that passed them", () => {
    render({ spf_result: "pass", dkim_result: "pass", dmarc_result: "pass" });

    expect(container!.textContent).toContain("mail.email_auth_details_label");
    expect(checks()).toEqual([
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
    ]);
  });

  it("lists unusual and missing results as they are", () => {
    render({ spf_result: "softfail", dmarc_result: "none" });

    expect(checks()).toEqual([
      ["spf", "other"],
      ["dkim", "missing"],
      ["dmarc", "none"],
    ]);
  });

  it("has no row without results", () => {
    render(null);
    expect(checks()).toEqual([]);
    expect(container!.textContent).not.toContain(
      "mail.email_auth_details_label",
    );

    act(() => {
      root!.unmount();
    });
    container!.remove();
    render({});
    expect(checks()).toEqual([]);
  });
});
