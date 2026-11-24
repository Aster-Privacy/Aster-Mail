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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  DesktopCalendarPanel,
  resolve_desktop_calendar_gate,
} from "./desktop_calendar_panel";

const h = vi.hoisted(() => ({
  auth: {
    user: { id: "user_a", email: "a@example.org" } as {
      id: string;
      email: string;
    } | null,
    is_loading: false,
    is_authenticated: true,
    has_keys: true,
    current_account_id: "acct_a" as string | null,
    vault: null,
  },
  agenda: {
    events: [] as unknown[],
    up_next_events: [] as unknown[],
    calendars: [] as unknown[],
    calendar_count: 0,
    status: "ready" as string,
    refresh_failed: false,
    retry: vi.fn(),
  },
  agenda_calls: [] as { account_id: string | null }[],
  locked: false,
  has_vault: true,
  open_external: vi.fn(),
  open_calendar_externally: vi.fn(),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => h.auth,
}));

vi.mock("@/components/layout/use_desktop_agenda", () => ({
  use_desktop_agenda: (options: { account_id: string | null }) => {
    h.agenda_calls.push({ account_id: options.account_id });

    return h.agenda;
  },
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { time_format: "24h", calendar_week_starts_on: "monday" },
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: () => ({ enabled: h.locked }),
  is_session_unlocked: () => false,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory_for: () => h.has_vault,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: h.open_external,
}));

vi.mock("@/components/layout/quick_calendar_panel", () => ({
  open_calendar_externally: h.open_calendar_externally,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function make_event(
  overrides: Partial<DecryptedCalendarEvent> = {},
): DecryptedCalendarEvent {
  const start = new Date();

  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);

  return {
    id: "evt_1",
    calendar_id: "cal_1",
    title: "Design review",
    description: "<p>Bring <b>notes</b></p>",
    location: "Room 4",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
    recurrence_master_id: null,
    occurrence_start: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const ready_calendar = {
  id: "cal_1",
  name: "Personal",
  color: "#3b82f6",
  icon: "calendar",
  is_visible: true,
  is_default: true,
};

describe("resolve_desktop_calendar_gate", () => {
  const base = {
    is_loading: false,
    is_authenticated: true,
    account_id: "acct",
    user_id: "user",
    has_keys: true,
    is_locked: false,
    has_vault: true,
  };

  it("orders loading, signed out, locked, keys, and ready", () => {
    expect(resolve_desktop_calendar_gate({ ...base, is_loading: true })).toBe(
      "loading",
    );
    expect(
      resolve_desktop_calendar_gate({ ...base, is_authenticated: false }),
    ).toBe("signed_out");
    expect(resolve_desktop_calendar_gate({ ...base, account_id: null })).toBe(
      "signed_out",
    );
    expect(
      resolve_desktop_calendar_gate({ ...base, is_locked: true, has_keys: false }),
    ).toBe("locked");
    expect(resolve_desktop_calendar_gate({ ...base, has_keys: false })).toBe(
      "keys",
    );
    expect(resolve_desktop_calendar_gate({ ...base, has_vault: false })).toBe(
      "keys",
    );
    expect(resolve_desktop_calendar_gate(base)).toBe("ready");
  });
});

describe("DesktopCalendarPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  let on_close: ReturnType<typeof vi.fn<() => void>>;

  const render = async (is_open = true) => {
    await act(async () => {
      root.render(
        <DesktopCalendarPanel
          is_open={is_open}
          is_swapping={false}
          on_close={on_close}
        />,
      );
    });
  };

  const text = () => container.textContent ?? "";

  const press_escape = async (target: Element | null) => {
    await act(async () => {
      target?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
  };

  const click = async (element: Element | null | undefined) => {
    await act(async () => {
      (element as HTMLElement | null)?.click();
    });
  };

  const find_button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(label) ||
        button.getAttribute("aria-label") === label,
    );

  beforeEach(() => {
    h.auth.user = { id: "user_a", email: "a@example.org" };
    h.auth.is_loading = false;
    h.auth.is_authenticated = true;
    h.auth.has_keys = true;
    h.auth.current_account_id = "acct_a";
    h.agenda.events = [];
    h.agenda.up_next_events = [];
    h.agenda.calendars = [ready_calendar];
    h.agenda.calendar_count = 1;
    h.agenda.status = "ready";
    h.agenda.refresh_failed = false;
    h.agenda.retry = vi.fn();
    h.agenda_calls.length = 0;
    h.locked = false;
    h.has_vault = true;
    h.open_external.mockReset();
    h.open_calendar_externally.mockReset();
    on_close = vi.fn<() => void>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not load anything before the panel first opens", async () => {
    await render(false);

    expect(h.agenda_calls).toHaveLength(0);
  });

  it("asks a signed-out user to sign in", async () => {
    h.auth.is_authenticated = false;
    h.auth.user = null;
    h.auth.current_account_id = null;
    await render();

    expect(text()).toContain("calendar.panel_signed_out");
    expect(h.agenda_calls).toHaveLength(0);
  });

  it("asks for an unlock when the app is locked", async () => {
    h.locked = true;
    await render();

    expect(text()).toContain("calendar.panel_locked");
    expect(h.agenda_calls).toHaveLength(0);
  });

  it("waits for keys and lets the user check again", async () => {
    h.has_vault = false;
    await render();

    expect(text()).toContain("calendar.panel_keys_loading");
    expect(h.agenda_calls).toHaveLength(0);

    h.has_vault = true;
    await click(find_button("calendar.panel_try_again"));

    expect(h.agenda_calls.length).toBeGreaterThan(0);
  });

  it("shows a skeleton while loading", async () => {
    h.agenda.status = "loading";
    await render();

    expect(
      container.querySelector('[data-testid="desktop_calendar_skeleton"]'),
    ).not.toBeNull();
  });

  it("shows an error with a working retry when the load fails", async () => {
    h.agenda.status = "failed";
    await render();

    expect(text()).toContain("calendar.panel_load_failed");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    await click(find_button("calendar.panel_try_again"));

    expect(h.agenda.retry).toHaveBeenCalledTimes(1);
  });

  it("explains when the calendar service is turned off", async () => {
    h.agenda.status = "unavailable";
    await render();

    expect(text()).toContain("calendar.panel_unavailable");
  });

  it("points a new user to Calendar when there are no calendars", async () => {
    h.agenda.status = "empty";
    await render();

    expect(text()).toContain("calendar.panel_no_calendars");

    await click(find_button("calendar.panel_open_calendar"));

    expect(h.open_calendar_externally).toHaveBeenCalled();
  });

  it("keeps saved events visible when a refresh fails", async () => {
    h.agenda.events = [make_event()];
    h.agenda.refresh_failed = true;
    await render();

    expect(text()).toContain("calendar.panel_refresh_failed");
    expect(text()).toContain("Design review");
  });

  it("opens an event, returns on Escape, then closes on a second Escape", async () => {
    h.agenda.events = [make_event()];
    await render();

    const rows = Array.from(container.querySelectorAll("li button"));

    await click(rows[0]);

    expect(text()).toContain("Room 4");
    expect(text()).toContain("Bring notes");
    expect(container.innerHTML).not.toContain("<b>notes</b>");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "common.back",
    );

    await press_escape(document.activeElement);

    expect(on_close).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="desktop_calendar_agenda"]'),
    ).not.toBeNull();

    await press_escape(document.body);

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("opens the event in Calendar through the safe link helper", async () => {
    h.agenda.events = [make_event()];
    await render();
    await click(container.querySelector("li button"));
    await click(find_button("calendar.panel_open_event"));

    const url = new URL(h.open_external.mock.calls[0][0] as string);

    expect(url.origin).toBe("https://calendar.astermail.org");
    expect(url.searchParams.get("event")).toBe("evt_1");
  });

  it("reloads for the new account and leaves the event view on a switch", async () => {
    h.agenda.events = [make_event()];
    await render();
    await click(container.querySelector("li button"));

    h.auth.current_account_id = "acct_b";
    h.auth.user = { id: "user_b", email: "b@example.org" };
    await render();

    expect(h.agenda_calls.at(-1)?.account_id).toBe("acct_b");
    expect(
      container.querySelector('[data-testid="desktop_calendar_agenda"]'),
    ).not.toBeNull();
  });

  it("moves the selected day with the arrow keys", async () => {
    await render();

    const selected = () =>
      container.querySelector<HTMLButtonElement>(
        '[role="grid"] button[tabindex="0"]',
      );
    const before = selected()?.getAttribute("aria-label");

    await act(async () => {
      selected()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });

    expect(selected()?.getAttribute("aria-label")).not.toBe(before);
    expect(document.activeElement).toBe(selected());
  });

  it("closes from the header button", async () => {
    await render();
    await click(find_button("common.close"));

    expect(on_close).toHaveBeenCalledTimes(1);
  });
});
