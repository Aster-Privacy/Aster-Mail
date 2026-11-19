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
import { afterEach, describe, expect, it, vi } from "vitest";

const native_state = vi.hoisted(() => ({ native: false }));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

vi.mock("@/native/capacitor_bridge", async (import_original) => ({
  ...(await import_original<typeof import("@/native/capacitor_bridge")>()),
  is_native_platform: () => native_state.native,
}));

vi.mock("@/utils/print_page", async (import_original) => ({
  ...(await import_original<typeof import("@/utils/print_page")>()),
  run_web_print: () => undefined,
}));

vi.mock("capacitor-webview-print", () => ({
  WebviewPrint: { print: () => new Promise<void>(() => undefined) },
}));

import { print_email } from "./print_email";

const translate = ((key: string) => key) as Parameters<typeof print_email>[1];

function printed_body_rule(): string {
  print_email(
    {
      subject: "Order",
      sender: "Shop",
      sender_email: "shop@example.com",
      to: [{ email: "ada@example.com" }],
      timestamp: "Today",
      body: '<div style="position:absolute;top:0;left:0">Badge</div>',
    },
    translate,
    "never",
  );

  const css = document.getElementById("aster-print-styles")?.textContent ?? "";
  const rule = /#aster-print-root \.ap-body \{([^}]*)\}/.exec(css);

  return rule ? rule[1] : "";
}

afterEach(() => {
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();
  native_state.native = false;
});

describe("printed message body", () => {
  for (const native of [false, true]) {
    it(`keeps positioned mail inside the body on ${native ? "mobile" : "the web"}`, () => {
      native_state.native = native;

      const rule = printed_body_rule();

      expect(rule).toMatch(/position:\s*relative/);
      expect(rule).toMatch(/overflow:\s*hidden/);
      expect(rule).toMatch(/isolation:\s*isolate/);
    });
  }

  it("prints a positioned badge where the message placed it", () => {
    printed_body_rule();

    const badge = document.querySelector<HTMLElement>(
      "#aster-print-root .ap-body div",
    );

    expect(badge?.style.position).toBe("absolute");
  });
});
