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

import {
  AGENDA_SYNC_TIMEOUT_MS,
  derive_agenda_status,
  use_desktop_agenda,
  type AgendaState,
} from "./use_desktop_agenda";

const engine = vi.hoisted(() => ({
  ensure_loaded: vi.fn(),
  pull_delta: vi.fn(),
  last_failure_status: vi.fn(),
  get_events: vi.fn(),
  get_calendars: vi.fn(),
  calendar_count: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  calendar_sync_engine: engine,
}));

vi.mock("@/services/calendar/recurrence", () => ({
  expand_events: (events: unknown[]) => events,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("derive_agenda_status", () => {
  it("covers every sync outcome", () => {
    expect(derive_agenda_status(null, 0).status).toBe("loading");
    expect(derive_agenda_status(null, 2).status).toBe("ready");
    expect(derive_agenda_status({ ok: true, failure_status: null }, 0).status).toBe(
      "empty",
    );
    expect(derive_agenda_status({ ok: true, failure_status: null }, 1)).toEqual({
      status: "ready",
      refresh_failed: false,
    });
    expect(derive_agenda_status({ ok: false, failure_status: 503 }, 1)).toEqual({
      status: "ready",
      refresh_failed: true,
    });
    expect(derive_agenda_status({ ok: false, failure_status: 404 }, 0).status).toBe(
      "unavailable",
    );
    expect(derive_agenda_status({ ok: false, failure_status: 503 }, 0).status).toBe(
      "failed",
    );
    expect(derive_agenda_status({ ok: false, failure_status: null }, 0).status).toBe(
      "failed",
    );
  });
});

describe("use_desktop_agenda", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: AgendaState | null;

  const range_start = new Date(2026, 10, 1);
  const range_end = new Date(2026, 11, 31);

  function Probe({ account_id }: { account_id: string }) {
    latest = use_desktop_agenda({
      enabled: true,
      account_id,
      range_start,
      range_end,
      up_next_start: range_start,
      up_next_end: range_end,
    });

    return null;
  }

  const render = async (account_id = "acct_a") => {
    await act(async () => {
      root.render(<Probe account_id={account_id} />);
    });
  };

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    latest = null;
    engine.ensure_loaded.mockReset().mockResolvedValue(undefined);
    engine.pull_delta.mockReset().mockResolvedValue(true);
    engine.last_failure_status.mockReset().mockReturnValue(null);
    engine.get_events.mockReset().mockReturnValue([]);
    engine.get_calendars.mockReset().mockReturnValue([]);
    engine.calendar_count.mockReset().mockReturnValue(0);
    engine.subscribe.mockReset().mockReturnValue(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("reports an empty account after a clean sync", async () => {
    await render();
    await flush();

    expect(latest?.status).toBe("empty");
  });

  it("reports the service as unavailable on a 404", async () => {
    engine.pull_delta.mockResolvedValue(false);
    engine.last_failure_status.mockReturnValue(404);
    await render();
    await flush();

    expect(latest?.status).toBe("unavailable");
  });

  it("recovers on retry after a server error", async () => {
    engine.pull_delta.mockResolvedValue(false);
    engine.last_failure_status.mockReturnValue(503);
    await render();
    await flush();

    expect(latest?.status).toBe("failed");

    engine.pull_delta.mockResolvedValue(true);
    engine.calendar_count.mockReturnValue(1);
    await act(async () => {
      latest?.retry();
    });
    await flush();

    expect(latest?.status).toBe("ready");
  });

  it("stops waiting when the sync hangs", async () => {
    vi.useFakeTimers();
    engine.ensure_loaded.mockReturnValue(new Promise(() => {}));
    await render();

    expect(latest?.status).toBe("loading");

    await act(async () => {
      vi.advanceTimersByTime(AGENDA_SYNC_TIMEOUT_MS + 1);
    });
    await flush();

    expect(latest?.status).toBe("failed");
  });

  it("drops stale results after an account switch", async () => {
    let resolve_first: (value: boolean) => void = () => {};

    engine.pull_delta.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolve_first = resolve;
      }),
    );
    await render("acct_a");
    await flush();

    engine.pull_delta.mockResolvedValue(false);
    engine.last_failure_status.mockReturnValue(503);
    await render("acct_b");
    await flush();

    expect(latest?.status).toBe("failed");

    await act(async () => {
      resolve_first(true);
    });
    await flush();

    expect(latest?.status).toBe("failed");
  });

  it("never reads events before the account has loaded", async () => {
    engine.ensure_loaded.mockReturnValue(new Promise(() => {}));
    engine.calendar_count.mockReturnValue(3);
    await render();

    expect(engine.get_events).not.toHaveBeenCalled();
    expect(latest?.status).toBe("loading");
  });
});
