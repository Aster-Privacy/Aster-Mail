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
    undo_send_enabled: false as boolean,
    undo_send_seconds: 0 as number,
    undo_send_period: "0 seconds",
  },
  show_action_toast: vi.fn(),
  execute_unsubscribe: vi.fn<(info: unknown) => Promise<string>>(
    async () => "api",
  ),
  persist_unsubscribe: vi.fn(),
  unsubscribed_senders: new Set<string>(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
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

vi.mock("@/utils/unsubscribe_detector", async (import_original) => {
  const actual =
    await import_original<typeof import("@/utils/unsubscribe_detector")>();

  return {
    ...actual,
    execute_unsubscribe: h.execute_unsubscribe,
    get_manual_unsubscribe_url: () => null,
  };
});

vi.mock("@/utils/open_link", () => ({
  open_external: vi.fn(),
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: h.persist_unsubscribe,
  use_unsubscribed_senders: () => ({
    is_unsubscribed: (email: string) => h.unsubscribed_senders.has(email),
  }),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: (
    enabled: boolean | undefined,
    seconds: number | undefined,
  ) => (enabled === false || !seconds || seconds <= 0 ? 0 : seconds * 1000),
}));

const { RowUnsubscribeChip, row_has_unsubscribe_header } = await import(
  "./row_unsubscribe_chip"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ONE_CLICK = {
  sender_email: "news@example.com",
  sender_name: "News",
  list_unsubscribe: "<https://example.com/unsub?u=1>",
  list_unsubscribe_post: "List-Unsubscribe=One-Click",
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_chip(
  email: Parameters<typeof RowUnsubscribeChip>[0]["email"],
  on_row_click?: () => void,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div role="presentation" onClick={on_row_click}>
        <RowUnsubscribeChip email={email} />
      </div>,
    );
  });
}

function chip() {
  return container!.querySelector<HTMLButtonElement>(
    "[data-testid=row-unsubscribe]",
  );
}

describe("RowUnsubscribeChip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.preferences.undo_send_enabled = false;
    h.preferences.undo_send_seconds = 0;
    h.show_action_toast.mockClear();
    h.execute_unsubscribe.mockClear();
    h.execute_unsubscribe.mockImplementation(async () => "api");
    h.persist_unsubscribe.mockClear();
    h.unsubscribed_senders.clear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("shows for a one-click List-Unsubscribe header", () => {
    render_chip(ONE_CLICK);
    expect(chip()?.textContent).toBe("mail.unsubscribe");
  });

  it("shows for a mailto List-Unsubscribe header", () => {
    render_chip({
      ...ONE_CLICK,
      list_unsubscribe: "<mailto:leave@example.com>",
      list_unsubscribe_post: undefined,
    });
    expect(chip()).not.toBeNull();
  });

  it("hides without a List-Unsubscribe header", () => {
    render_chip({ ...ONE_CLICK, list_unsubscribe: undefined });
    expect(chip()).toBeNull();
  });

  it("hides a one-click header that failed DKIM and has no mailto", () => {
    render_chip({ ...ONE_CLICK, dkim_result: "fail" });
    expect(chip()).toBeNull();
  });

  it("hides once the sender is unsubscribed", () => {
    h.unsubscribed_senders.add("news@example.com");
    render_chip(ONE_CLICK);
    expect(chip()).toBeNull();
  });

  it("unsubscribes, records the sender, and does not open the message", async () => {
    const row_click = vi.fn();

    render_chip(ONE_CLICK, row_click);

    await act(async () => {
      chip()!.click();
      await vi.runAllTimersAsync();
    });

    expect(row_click).not.toHaveBeenCalled();
    expect(h.execute_unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.execute_unsubscribe.mock.calls[0][0]).toMatchObject({
      method: "one-click",
      unsubscribe_link: "https://example.com/unsub?u=1",
    });
    expect(h.persist_unsubscribe).toHaveBeenCalledWith(
      "news@example.com",
      "News",
      expect.objectContaining({
        unsubscribe_link: "https://example.com/unsub?u=1",
      }),
      "manual",
    );
    expect(chip()).toBeNull();
  });

  it("waits for the undo window and cancels on undo", async () => {
    h.preferences.undo_send_enabled = true;
    h.preferences.undo_send_seconds = 5;
    render_chip(ONE_CLICK);

    act(() => {
      chip()!.click();
    });
    expect(chip()).toBeNull();

    const [options] = h.show_action_toast.mock.calls[0];

    expect(options.message).toBe("settings.unsubscribing");

    await act(async () => {
      await options.on_undo();
      await vi.runAllTimersAsync();
    });

    expect(h.execute_unsubscribe).not.toHaveBeenCalled();
    expect(chip()).not.toBeNull();
  });

  it("brings the chip back when the request fails", async () => {
    h.execute_unsubscribe.mockImplementation(async () => {
      throw new Error("network");
    });
    render_chip(ONE_CLICK);

    await act(async () => {
      chip()!.click();
      await vi.runAllTimersAsync();
    });

    expect(h.show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "mail.unsubscribe_failed" }),
    );
    expect(chip()).not.toBeNull();
  });

  it("detects the header on a row", () => {
    expect(row_has_unsubscribe_header(ONE_CLICK)).toBe(true);
    expect(
      row_has_unsubscribe_header({ ...ONE_CLICK, list_unsubscribe: "  " }),
    ).toBe(false);
    expect(row_has_unsubscribe_header({ ...ONE_CLICK, sender_email: "" })).toBe(
      false,
    );
  });
});
