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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RecipientBadge } from "@/components/compose/compose_recipients";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { show_encryption_indicators: true } }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: () => false,
  discover_external_keys_batch: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("recipient badge encryption status", () => {
  it("labels a failed key lookup as undetermined rather than transit only", () => {
    act(() => {
      root.render(
        <RecipientBadge email="someone@example.test" encryption_status="unknown" />,
      );
    });

    const lock = container.querySelector("button");

    expect(lock?.getAttribute("aria-label")).toBe(
      "common.encryption_status_unknown",
    );

    act(() => {
      lock?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "common.encryption_status_unknown_desc",
    );
    expect(container.textContent).not.toContain("common.protected_in_transit");
  });

  it("keeps the transport-only wording for a recipient with no keys", () => {
    act(() => {
      root.render(
        <RecipientBadge email="someone@example.test" encryption_status="transit" />,
      );
    });

    const lock = container.querySelector("button");

    expect(lock?.getAttribute("aria-label")).toBe("common.protected_in_transit");
  });
});
