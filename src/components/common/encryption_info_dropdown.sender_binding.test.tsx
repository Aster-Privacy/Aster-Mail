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
import type { SenderVerificationStatus } from "@/types/email";
import type { SentEncryptionScope } from "@/services/crypto/sent_encryption_evidence";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
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

import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { names_sender_as_reader } from "@/services/crypto/sent_encryption_evidence";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function open_dropdown(props: {
  e2e_verified?: boolean;
  sender_bound?: boolean;
  details_sealed?: boolean;
  sender_verification?: SenderVerificationStatus;
  sent_encryption_scope?: SentEncryptionScope;
}): string {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <EncryptionInfoDropdown
        has_pq_protection={false}
        is_external={false}
        {...props}
      />,
    );
  });
  mounted.push({ root, container });

  act(() => {
    container.querySelector("button")?.click();
  });

  return document.body.textContent ?? "";
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("EncryptionInfoDropdown reader description", () => {
  it("does not name the sender when a body only decrypts", () => {
    const text = open_dropdown({ e2e_verified: true });

    expect(text).toContain("common.end_to_end_encrypted_label");
    expect(text).toContain("common.encrypted_to_you_unconfirmed_sender");
    expect(text).not.toContain("common.only_you_and_sender");
  });

  it("names the sender for a sender-bound session with sealed details", () => {
    const text = open_dropdown({
      e2e_verified: true,
      sender_bound: true,
      details_sealed: true,
    });

    expect(text).toContain("common.only_you_and_sender");
    expect(text).not.toContain("details_from_server");
    expect(text).not.toContain("common.encrypted_to_you_unconfirmed_sender");
  });

  it("says the details come from the server when they are not sealed", () => {
    const text = open_dropdown({ e2e_verified: true, sender_bound: true });

    expect(text).toContain("common.only_you_and_sender_details_from_server");
    expect(text).not.toContain("common.encrypted_to_you_unconfirmed_sender");
  });

  it("names the sender for a verified signature", () => {
    const text = open_dropdown({
      e2e_verified: true,
      sender_verification: "verified",
    });

    expect(text).toContain("common.only_you_and_sender");
  });

  it("names the sender on your own sent copy", () => {
    const text = open_dropdown({ sent_encryption_scope: "internal" });

    expect(text).toContain("common.only_you_and_sender");
    expect(text).not.toContain("details_from_server");
  });
});

describe("names_sender_as_reader", () => {
  it("needs a sender-bound session, a verified signature or a sent copy", () => {
    expect(names_sender_as_reader({})).toBe(false);
    expect(names_sender_as_reader({ sender_verification: "unsigned" })).toBe(
      false,
    );
    expect(names_sender_as_reader({ sender_verification: "no_keys" })).toBe(
      false,
    );
    expect(names_sender_as_reader({ e2e_sender_bound: true })).toBe(true);
    expect(names_sender_as_reader({ sender_verification: "verified" })).toBe(
      true,
    );
    expect(names_sender_as_reader({ sent_encryption_scope: "internal" })).toBe(
      true,
    );
  });
});
