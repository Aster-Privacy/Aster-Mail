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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const settings = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, is_rtl: false }),
}));

const { TrackingProtectionShield } =
  await import("@/components/email/tracking_protection_shield");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REPORT: ExternalContentReport = {
  has_remote_images: true,
  has_remote_fonts: false,
  has_remote_css: false,
  has_tracking_pixels: true,
  blocked_count: 1,
  blocked_items: [
    { url: "https://open.metrics.example/o.gif", type: "tracking_pixel" },
  ],
  cleaned_links: [],
};

const BLOCKING_OFF = {
  load_remote_images: "always",
  block_external_content: false,
  block_remote_images: false,
  block_remote_fonts: false,
  block_remote_css: false,
  block_tracking_pixels: false,
  low_network_mode: false,
};

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

function shield_shown(preferences: Record<string, unknown>): boolean {
  settings.preferences = preferences;
  act(() => {
    root.render(<TrackingProtectionShield report={REPORT} />);
  });

  return container.querySelector("button") !== null;
}

describe("TrackingProtectionShield effective policy", () => {
  it("hides when nothing is blocked by the settings", () => {
    expect(shield_shown(BLOCKING_OFF)).toBe(false);
  });

  it("shows when the content protection switch is on", () => {
    expect(
      shield_shown({ ...BLOCKING_OFF, block_external_content: true }),
    ).toBe(true);
  });

  it("shows when images are blocked with the content protection switch off", () => {
    expect(
      shield_shown({
        ...BLOCKING_OFF,
        block_remote_images: true,
        load_remote_images: "never",
      }),
    ).toBe(true);
    expect(
      shield_shown({
        ...BLOCKING_OFF,
        block_remote_images: true,
        load_remote_images: "ask",
      }),
    ).toBe(true);
  });

  it("shows in low network mode", () => {
    expect(shield_shown({ ...BLOCKING_OFF, low_network_mode: true })).toBe(
      true,
    );
  });
});
