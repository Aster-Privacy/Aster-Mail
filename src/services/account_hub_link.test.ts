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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HUB_ORIGIN = "https://hub.link.test";
const CHANNEL = "aster_account_link";
const FINGERPRINT = "9B16 AF79 0A6A E2F2 55D3";

let requested_frame_sources: string[] = [];

vi.mock("@/lib/i18n/translations", () => ({
  get_active_language: () => "en",
  get_translations_async: async () => ({
    auth: {
      device_fingerprint: "Device fingerprint",
      device_code_fingerprint_required_hint: "Type this fingerprint below.",
    },
  }),
}));

function bridge_frame(): HTMLIFrameElement {
  const frame = document.querySelector("iframe");

  if (!frame) throw new Error("no bridge frame");

  return frame;
}

function reply_from_bridge(data: Record<string, unknown>): void {
  const frame = bridge_frame();

  window.dispatchEvent(
    new MessageEvent("message", {
      data: { channel: CHANNEL, ...data },
      origin: HUB_ORIGIN,
      source: frame.contentWindow,
    }),
  );
}

async function start_link(): Promise<{
  result: Promise<void>;
  sent: Array<Record<string, unknown>>;
}> {
  const { confirm_hub_link } = await import("./account_hub_link");
  const sent: Array<Record<string, unknown>> = [];
  const result = confirm_hub_link("code_one", "acct_a", FINGERPRINT);

  await vi.waitFor(() => {
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  const frame = bridge_frame();
  const target = frame.contentWindow as Window;

  vi.spyOn(target, "postMessage").mockImplementation(((message: unknown) => {
    sent.push(message as Record<string, unknown>);
  }) as Window["postMessage"]);

  reply_from_bridge({ action: "ready" });

  await vi.waitFor(() => {
    expect(sent.some((message) => message.action === "link")).toBe(true);
  });

  return { result, sent };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_ACCOUNT_HUB_ORIGIN", HUB_ORIGIN);
  document.body.replaceChildren();
  requested_frame_sources = [];
  vi.spyOn(HTMLIFrameElement.prototype, "src", "set").mockImplementation(
    (value: string) => {
      requested_frame_sources.push(value);
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hub link confirmation", () => {
  it("shows the bridge window and the device fingerprint while it waits", async () => {
    const { result, sent } = await start_link();
    const frame = bridge_frame();
    const banner = document.querySelector("[data-hub-link-fingerprint]");

    expect(requested_frame_sources).toEqual([HUB_ORIGIN + "/bridge.html"]);
    expect(frame.hidden).toBe(false);
    expect(frame.getAttribute("aria-hidden")).toBeNull();
    expect(banner?.textContent).toContain(FINGERPRINT);

    const link = sent.find((message) => message.action === "link")!;

    reply_from_bridge({ action: "link", id: link.id, ok: true });
    await result;

    expect(frame.hidden).toBe(true);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[data-hub-link-fingerprint]")).toBeNull();
  });

  it("hides the bridge window again when the person declines", async () => {
    const { result, sent } = await start_link();
    const link = sent.find((message) => message.action === "link")!;

    reply_from_bridge({
      action: "link",
      id: link.id,
      ok: false,
      error: "declined",
    });

    await expect(result).rejects.toMatchObject({ code: "declined" });
    expect(bridge_frame().hidden).toBe(true);
    expect(document.querySelector("[data-hub-link-fingerprint]")).toBeNull();
  });

  it("waits longer than the bridge gives the person to type", async () => {
    vi.useFakeTimers();

    try {
      const { result, sent } = await start_link();
      const link = sent.find((message) => message.action === "link")!;
      let settled = false;

      result.then(
        () => (settled = true),
        () => (settled = true),
      );

      await vi.advanceTimersByTimeAsync(125_000);
      expect(settled).toBe(false);

      reply_from_bridge({ action: "link", id: link.id, ok: true });
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});
