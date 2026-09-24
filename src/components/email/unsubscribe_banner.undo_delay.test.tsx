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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  preferences: {
    undo_send_enabled: true as boolean,
    undo_send_seconds: 10 as number,
    undo_send_period: "10 seconds",
  },
  show_action_toast: vi.fn(),
  execute_unsubscribe: vi.fn(async () => "api"),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: h.preferences }),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: h.show_action_toast,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  get_unsubscribe_display_text: () => "unsubscribe",
  get_sender_domain: () => "example.com",
  execute_unsubscribe: h.execute_unsubscribe,
  get_manual_unsubscribe_url: () => null,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: vi.fn(),
}));

vi.mock("@/services/api/subscriptions", () => ({
  track_subscription: vi.fn(async () => ({})),
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: vi.fn(),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: (
    enabled: boolean | undefined,
    seconds: number | undefined,
  ) => (enabled === false || !seconds || seconds <= 0 ? 0 : seconds * 1000),
}));

const { UnsubscribeBanner } = await import("./unsubscribe_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_banner() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <UnsubscribeBanner
        sender_email="news@example.com"
        sender_name="News"
        unsubscribe_info={
          {
            has_unsubscribe: true,
            unsubscribe_link: "https://example.com/unsub",
            list_unsubscribe_header: undefined,
          } as never
        }
      />,
    );
  });
}

function click_unsubscribe() {
  const button = Array.from(container!.querySelectorAll("button")).find(
    (b) => b.textContent === "mail.unsubscribe",
  );

  act(() => {
    button!.click();
  });
}

function unsubscribing_toasts() {
  return h.show_action_toast.mock.calls.filter(
    ([options]) => options.message === "settings.unsubscribing",
  );
}

describe("UnsubscribeBanner undo delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.show_action_toast.mockClear();
    h.execute_unsubscribe.mockClear();
    h.preferences.undo_send_enabled = true;
    h.preferences.undo_send_seconds = 10;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("offers an undo for the configured period before unsubscribing", async () => {
    h.preferences.undo_send_seconds = 5;
    render_banner();
    click_unsubscribe();

    const toasts = unsubscribing_toasts();

    expect(toasts).toHaveLength(1);
    expect(toasts[0][0].duration_ms).toBe(5000);
    expect(typeof toasts[0][0].on_undo).toBe("function");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(h.execute_unsubscribe).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(h.execute_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes at once with no undo when the synced period is zero", async () => {
    h.preferences.undo_send_seconds = 0;
    render_banner();
    click_unsubscribe();

    expect(unsubscribing_toasts()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.execute_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes at once with no undo when undo send is off", async () => {
    h.preferences.undo_send_enabled = false;
    render_banner();
    click_unsubscribe();

    expect(unsubscribing_toasts()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.execute_unsubscribe).toHaveBeenCalledTimes(1);
  });
});
