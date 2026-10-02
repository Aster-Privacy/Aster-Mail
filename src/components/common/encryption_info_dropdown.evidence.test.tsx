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

interface RenderProps {
  is_external: boolean;
  has_recipient_key?: boolean;
  has_pq_protection?: boolean;
  e2e_verified?: boolean;
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render_open(props: RenderProps): string {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <EncryptionInfoDropdown
        e2e_verified={props.e2e_verified}
        has_pq_protection={props.has_pq_protection ?? false}
        has_recipient_key={props.has_recipient_key}
        is_external={props.is_external}
      />,
    );
  });
  mounted.push({ root, container });

  act(() => {
    container.querySelector("button")!.click();
  });

  return document.body.textContent ?? "";
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("EncryptionInfoDropdown end to end evidence", () => {
  it("shows protected in transit for a server flagged internal message without evidence", () => {
    const text = render_open({ is_external: false });

    expect(text).toContain("common.protected_in_transit");
    expect(text).toContain("common.encrypted_in_transit_stored");
    expect(text).not.toContain("common.end_to_end_encrypted_label");
  });

  it("shows end to end encrypted for a ratchet decrypted internal message", () => {
    const text = render_open({ is_external: false, e2e_verified: true });

    expect(text).toContain("common.end_to_end_encrypted_label");
    expect(text).toContain("common.only_you_and_sender");
    expect(text).not.toContain("common.protected_in_transit");
  });

  it("downgrades an external message with a recipient key but no evidence", () => {
    const text = render_open({ is_external: true, has_recipient_key: true });

    expect(text).toContain("common.protected_in_transit");
    expect(text).not.toContain("common.end_to_end_encrypted_label");
    expect(text).not.toContain("common.wkd_encrypted_description");
  });

  it("never upgrades an external message without a recipient key", () => {
    const text = render_open({ is_external: true, e2e_verified: true });

    expect(text).toContain("common.protected_in_transit");
    expect(text).not.toContain("common.end_to_end_encrypted_label");
  });

  it("hides the post quantum badge when evidence is missing", () => {
    const text = render_open({ is_external: false, has_pq_protection: true });

    expect(text).not.toContain("ML-KEM-768");
  });

  it("shows the post quantum badge when evidence is present", () => {
    const text = render_open({
      is_external: false,
      has_pq_protection: true,
      e2e_verified: true,
    });

    expect(text).toContain("ML-KEM-768");
  });
});
