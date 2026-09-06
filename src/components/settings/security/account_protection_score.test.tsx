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

import { AccountProtectionScore } from "./account_protection_score";

import { build_security_criteria } from "@/lib/security_criteria";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { account_security_banner_dismissed: false },
    update_preference: () => {},
  }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NONE = {
  totp_enabled: false,
  passkey_registered: false,
  recovery_email_verified: false,
  login_alerts_enabled: false,
  block_tracking_pixels: false,
  block_remote_images: false,
  strip_exif_on_compose: false,
};

describe("AccountProtectionScore", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_card = async (props: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(<AccountProtectionScore {...NONE} {...props} />);
    });
  };

  const open_breakdown = async () => {
    const review = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("account_security_review_cta"),
    );

    await act(async () => {
      review?.click();
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("reports zero percent when nothing is turned on", async () => {
    await render_card();

    expect(container.textContent).toContain('"percent":0');
  });

  it("reports one hundred percent when everything is turned on", async () => {
    await render_card({
      totp_enabled: true,
      passkey_registered: true,
      recovery_email_verified: true,
      login_alerts_enabled: true,
      block_tracking_pixels: true,
      block_remote_images: true,
      strip_exif_on_compose: true,
    });

    expect(container.textContent).toContain('"percent":100');
  });

  it("lists the shared criteria in order in the breakdown", async () => {
    await render_card();
    await open_breakdown();

    const labels = Array.from(document.querySelectorAll("li > button")).map(
      (b) => b.querySelector("span")?.textContent,
    );

    expect(labels).toEqual(
      build_security_criteria(NONE).map((criterion) => criterion.label_key),
    );
  });

  it("routes a breakdown click to the handler at the same index", async () => {
    const handlers = build_security_criteria(NONE).map(() => vi.fn());

    await render_card({ on_criterion_click: handlers });
    await open_breakdown();

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("li > button"),
    );

    await act(async () => {
      buttons[4]?.click();
    });

    expect(handlers[4]).toHaveBeenCalledTimes(1);
    expect(handlers.filter((h) => h.mock.calls.length > 0)).toHaveLength(1);
  });

  it("shows a skeleton until the security status loads", async () => {
    await render_card({ security_loaded: false });

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(container.textContent).not.toContain("account_security_review_cta");
  });
});
