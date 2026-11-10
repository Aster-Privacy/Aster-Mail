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
  use_preferences: () => ({
    preferences: { show_encryption_indicators: true },
  }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: () => false,
  discover_external_keys_batch: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

const long_address =
  "01366c79a4a66c4f66c79a4a66c66c1366c779a4a66c9af@example.test";

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

describe("recipient badge width", () => {
  it("sizes a long address to the field instead of a fixed cap", () => {
    act(() => {
      root.render(<RecipientBadge email={long_address} />);
    });

    const badge = container.firstElementChild as HTMLElement;
    const label = container.querySelector(
      `span[title="${long_address}"]`,
    ) as HTMLElement;

    expect(label.textContent).toBe(long_address);
    expect(label.className).not.toMatch(/max-w-\[/);
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("min-w-0");
    expect(badge.className).toContain("max-w-full");
    expect(badge.className).toContain("min-w-0");
  });
});
