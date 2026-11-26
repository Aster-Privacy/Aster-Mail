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
import type { ReactElement } from "react";
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));
vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => undefined,
}));
vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));
vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_full_datetime: () => "today" }),
}));

const { EncryptionInfoDropdown } =
  await import("@/components/common/encryption_info_dropdown");
const { MessageDetailsModal } = await import("./message_details_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Verdict = "end_to_end" | "in_transit";

interface Case {
  name: string;
  item_type: "received" | "sent";
  is_external: boolean;
  server_recipient_key: boolean;
  e2e_verified: boolean;
  sent_encryption_scope?: "internal" | "outside";
  expected: Verdict;
}

const CASES: Case[] = [
  {
    name: "outside mail encrypted to you with the server flag set",
    item_type: "received",
    is_external: true,
    server_recipient_key: true,
    e2e_verified: true,
    expected: "end_to_end",
  },
  {
    name: "outside mail encrypted to you without the server flag",
    item_type: "received",
    is_external: true,
    server_recipient_key: false,
    e2e_verified: true,
    expected: "end_to_end",
  },
  {
    name: "outside mail that arrived readable",
    item_type: "received",
    is_external: true,
    server_recipient_key: false,
    e2e_verified: false,
    expected: "in_transit",
  },
  {
    name: "outside mail the client could not open",
    item_type: "received",
    is_external: true,
    server_recipient_key: true,
    e2e_verified: false,
    expected: "in_transit",
  },
  {
    name: "sealed mail from another Aster account",
    item_type: "received",
    is_external: false,
    server_recipient_key: false,
    e2e_verified: true,
    expected: "end_to_end",
  },
  {
    name: "Aster mail whose sender was not confirmed",
    item_type: "received",
    is_external: false,
    server_recipient_key: false,
    e2e_verified: false,
    expected: "in_transit",
  },
  {
    name: "sent copy with verified evidence for outside recipients",
    item_type: "sent",
    is_external: true,
    server_recipient_key: false,
    e2e_verified: true,
    sent_encryption_scope: "outside",
    expected: "end_to_end",
  },
  {
    name: "sent copy with verified evidence for Aster recipients",
    item_type: "sent",
    is_external: false,
    server_recipient_key: false,
    e2e_verified: true,
    sent_encryption_scope: "internal",
    expected: "end_to_end",
  },
  {
    name: "sent copy to outside recipients without evidence",
    item_type: "sent",
    is_external: true,
    server_recipient_key: false,
    e2e_verified: true,
    expected: "in_transit",
  },
];

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

function mount(node: ReactElement): HTMLElement {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(node));
  mounted.push(root);

  return container;
}

function open_verdict(container: HTMLElement): Verdict {
  act(() => container.querySelector("button")!.click());
  const text = document.body.textContent ?? "";

  expect(
    text.includes("common.end_to_end_encrypted_label") !==
      text.includes("common.encrypted_in_transit_stored"),
  ).toBe(true);

  return text.includes("common.end_to_end_encrypted_label")
    ? "end_to_end"
    : "in_transit";
}

function header_verdict(test_case: Case): Verdict {
  const container = mount(
    <EncryptionInfoDropdown
      e2e_verified={test_case.e2e_verified}
      has_pq_protection={false}
      has_recipient_key={test_case.server_recipient_key}
      is_external={test_case.is_external}
      is_received={test_case.item_type === "received"}
      sent_encryption_scope={test_case.sent_encryption_scope}
    />,
  );
  const verdict = open_verdict(container);

  act(() => mounted.pop()?.unmount());
  container.remove();
  document.body.innerHTML = "";

  return verdict;
}

function thread_message(test_case: Case): DecryptedThreadMessage {
  return {
    id: "m1",
    item_type: test_case.item_type,
    sender_name: "Sender",
    sender_email: "sender@example.test",
    subject: "Subject",
    body: "body",
    timestamp: "2026-11-25T10:00:00Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: test_case.is_external,
    e2e_verified: test_case.e2e_verified,
    ...(test_case.sent_encryption_scope
      ? { sent_encryption_scope: test_case.sent_encryption_scope }
      : {}),
  };
}

function details_verdict(test_case: Case): { label: Verdict; panel: Verdict } {
  const container = mount(
    <MessageDetailsModal
      is_open
      message={thread_message(test_case)}
      on_close={() => {}}
    />,
  );
  const text = document.body.textContent ?? "";
  const label: Verdict = text.includes("mail.zero_access_encrypted")
    ? "end_to_end"
    : "in_transit";
  const trigger = [...document.querySelectorAll("button")].find((button) =>
    (button.textContent ?? "").match(
      /mail\.zero_access_encrypted|common\.protected_in_transit/,
    ),
  );

  act(() => trigger!.click());
  const opened = document.body.textContent ?? "";
  const panel: Verdict = opened.includes("common.end_to_end_encrypted_label")
    ? "end_to_end"
    : "in_transit";

  container.remove();

  return { label, panel };
}

describe("encryption label is the same in the header and in message details", () => {
  for (const test_case of CASES) {
    it(test_case.name, () => {
      const header = header_verdict(test_case);
      const details = details_verdict(test_case);

      expect(header).toBe(test_case.expected);
      expect(details.label).toBe(test_case.expected);
      expect(details.panel).toBe(test_case.expected);
    });
  }
});
