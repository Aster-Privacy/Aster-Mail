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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({ format_email_list: () => "10:00" }),
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_delivery: () => null,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/native/haptic_feedback", () => ({
  haptic_impact: () => {},
  haptic_long_press: () => {},
}));

vi.mock("@/components/mobile/swipe_actions", () => ({
  SwipeActions: ({ children }: { children?: unknown }) => children as never,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: unknown }) => children as never,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { request_cache } = await import("@/services/api/request_cache");
const { get_mail_item } = await import("@/services/api/mail");
const { MobileEmailRow } = await import("@/components/mobile/mobile_email_row");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sent: string[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function make_email(id: string): InboxEmail {
  return {
    id,
    item_type: "received",
    sender_name: `Sender ${id}`,
    sender_email: `${id}@example.com`,
    subject: `Subject ${id}`,
    preview: "preview",
    timestamp: "10:00",
    is_read: false,
    is_starred: false,
    has_attachment: false,
    folders: [],
    tags: [],
  } as unknown as InboxEmail;
}

function render(selection_mode = false): void {
  act(() => {
    root!.render(
      <MobileEmailRow
        current_view="inbox"
        email={make_email("a")}
        on_long_press={() => {}}
        on_press={(id) => {
          void get_mail_item(id);
        }}
        selection_mode={selection_mode}
      />,
    );
  });
}

function row(): HTMLElement {
  return container!.querySelector('[data-email-id="a"]') as HTMLElement;
}

function touch(type: string, x = 50, y = 50): void {
  act(() => {
    row().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 7,
        pointerType: "touch",
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  sent.length = 0;
  request_cache.clear();
  vi.mocked(routed_fetch).mockReset();
  vi.mocked(routed_fetch).mockImplementation(async (url, init) => {
    sent.push(
      `${(init?.method ?? "GET").toUpperCase()} ${new URL(String(url), "https://example.test").pathname.replace(/^\/api/, "")}`,
    );

    return new Promise<Response>(() => {});
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("MobileEmailRow press prefetch", () => {
  it("fetches the item when a tap lifts and the open reuses it", async () => {
    render();

    touch("pointerdown");
    await flush();

    expect(sent).toEqual([]);

    touch("pointerup", 52, 51);
    await flush();

    expect(sent).toEqual(["GET /mail/v1/messages/a"]);

    act(() => {
      row().click();
    });
    await flush();

    expect(sent).toEqual(["GET /mail/v1/messages/a"]);
  });

  it("does not fetch when the finger scrolls or the browser takes the gesture", async () => {
    render();

    touch("pointerdown");
    touch("pointermove", 50, 80);
    touch("pointerup", 50, 80);
    touch("pointerdown");
    touch("pointercancel");
    await flush();

    expect(sent).toEqual([]);
  });

  it("does not fetch for a long-press", async () => {
    render();

    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(1_000);
    touch("pointerdown");
    now.mockReturnValue(1_600);
    touch("pointerup");
    now.mockRestore();
    await flush();

    expect(sent).toEqual([]);
  });

  it("does not fetch in selection mode", async () => {
    render(true);

    touch("pointerdown");
    touch("pointerup");
    await flush();

    expect(sent).toEqual([]);
  });
});
