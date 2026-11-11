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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  show_action_toast: vi.fn(),
  execute_unsubscribe: vi.fn(async () => "manual"),
  persist_unsubscribe: vi.fn(),
  request_external_link: vi.fn(async (_url: string) => true),
  open_external: vi.fn(),
  lockdown_active: false as boolean,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { undo_send_enabled: false, undo_send_seconds: 0 },
  }),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: h.show_action_toast,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => h.lockdown_active,
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  get_unsubscribe_display_text: () => "unsubscribe",
  get_sender_domain: () => "example.com",
  execute_unsubscribe: h.execute_unsubscribe,
  get_manual_unsubscribe_url: () => "https://example.com/unsub",
  header_unsubscribe_link: () => undefined,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: h.open_external,
}));

vi.mock("@/utils/external_link_request", () => ({
  request_external_link: h.request_external_link,
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: h.persist_unsubscribe,
  use_unsubscribed_senders: () => ({
    is_unsubscribed: () => false,
    mark_unsubscribed: vi.fn(),
  }),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 0,
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
        delivery={{ routing_token: "token-alias" }}
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

async function click_unsubscribe() {
  const button = Array.from(container!.querySelectorAll("button")).find(
    (b) => b.textContent === "mail.unsubscribe",
  );

  act(() => {
    button!.click();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function manual_toast() {
  return h.show_action_toast.mock.calls.find(
    ([options]) => options.message === "mail.unsubscribe_manual_required",
  )?.[0];
}

describe("UnsubscribeBanner external link", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.show_action_toast.mockClear();
    h.execute_unsubscribe.mockClear();
    h.execute_unsubscribe.mockImplementation(async () => "manual");
    h.persist_unsubscribe.mockClear();
    h.request_external_link.mockReset();
    h.request_external_link.mockImplementation(async () => true);
    h.open_external.mockClear();
    h.lockdown_active = false;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("opens the unsubscribe page through the external link warning", async () => {
    render_banner();
    await click_unsubscribe();

    const toast = manual_toast();

    expect(toast?.action_label).toBe("mail.open_unsubscribe_page");
    await act(async () => {
      await toast!.on_undo();
    });

    expect(h.request_external_link).toHaveBeenCalledWith(
      "https://example.com/unsub",
    );
    expect(h.open_external).not.toHaveBeenCalled();
    expect(h.persist_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("records nothing when the unsubscribe page does not open", async () => {
    h.request_external_link.mockImplementation(async () => false);
    render_banner();
    await click_unsubscribe();

    await act(async () => {
      await manual_toast()!.on_undo();
    });

    expect(h.request_external_link).toHaveBeenCalledWith(
      "https://example.com/unsub",
    );
    expect(h.persist_unsubscribe).not.toHaveBeenCalled();
  });

  it("waits for the page to open before recording the unsubscribe", async () => {
    let finish!: (opened: boolean) => void;

    h.request_external_link.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render_banner();
    await click_unsubscribe();

    let undo!: Promise<void>;

    act(() => {
      undo = manual_toast()!.on_undo();
    });

    expect(h.persist_unsubscribe).not.toHaveBeenCalled();

    await act(async () => {
      finish(true);
      await undo;
    });

    expect(h.persist_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps one-click unsubscribe free of any link prompt", async () => {
    h.execute_unsubscribe.mockImplementation(async () => "api");
    render_banner();
    await click_unsubscribe();

    expect(h.execute_unsubscribe).toHaveBeenCalledTimes(1);
    expect(manual_toast()).toBeUndefined();
    expect(h.request_external_link).not.toHaveBeenCalled();
    expect(h.persist_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("offers no page link while a lockdown is active", async () => {
    h.lockdown_active = true;
    render_banner();
    await click_unsubscribe();

    expect(manual_toast()?.action_label).toBeUndefined();
    expect(h.request_external_link).not.toHaveBeenCalled();
  });
});
