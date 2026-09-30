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

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(sender_verification?: SenderVerificationStatus) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <EncryptionInfoDropdown
        has_pq_protection={false}
        is_external={false}
        sender_verification={sender_verification}
      />,
    );
  });
  mounted.push({ root, container });

  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("EncryptionInfoDropdown signature indicator", () => {
  it("shows a mismatch label next to the lock when the signature is invalid", () => {
    const container = render("invalid");
    const indicator = container.querySelector(
      '[data-testid="sender-signature-mismatch"]',
    );

    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toBe("common.sender_invalid_short");
    expect(container.querySelector("button")?.contains(indicator!)).toBe(
      true,
    );
  });

  it("shows no mismatch label for a verified sender", () => {
    const container = render("verified");

    expect(
      container.querySelector('[data-testid="sender-signature-mismatch"]'),
    ).toBeNull();
  });

  it("shows no mismatch label when verification is unknown", () => {
    const container = render();

    expect(
      container.querySelector('[data-testid="sender-signature-mismatch"]'),
    ).toBeNull();
  });
});
