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
import type { GuardEvent } from "@/services/guard/guard_events";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuardRescueBanner } from "@/components/guard/guard_rescue_banner";
import { GUARD_ACTION } from "@/lib/crypto/guard_action";
import {
  GUARD_RESCUE_POLL_MS,
  GUARD_RESCUE_STORAGE_KEY,
  GUARD_SETUP_AFTER_RESCUE_KEY,
  GUARD_SETUP_AFTER_RESCUE_TTL_MS,
  GuardRescueProgress,
  load_guard_rescue,
  mark_setup_after_rescue,
  save_guard_rescue,
  take_setup_after_rescue,
} from "@/pages/guard/guard_rescue_form";
import GuardVetoPage from "@/pages/guard/guard_veto_page";
import * as api from "@/services/api/guard";
import { sign_guard_action } from "@/services/guard/sign_action";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@/services/api/guard", () => ({
  guard_veto: vi.fn(),
  guard_rescue_status: vi.fn(),
}));

const DEVICE = { device_id: "22222222-3333-4444-8555-666666666666" };
const PROOF = { method: "password", password: "fake" };
const SIGNED = { nonce: "n_fake", sig: "s_fake" };

vi.mock("@/components/guard/guard_switches_panel", () => ({
  use_guard_device: () => ({ device: DEVICE }),
}));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: vi.fn(async () => PROOF),
    run: vi.fn(async (attempt: (proof: unknown) => Promise<unknown>) =>
      attempt(PROOF),
    ),
    step_up_modal: null,
  }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: null }),
}));

vi.mock("@/components/guard/guard_setup_wizard", () => ({
  GuardSetupWizard: () => null,
}));

vi.mock("@/services/guard/sign_action", () => ({
  sign_guard_action: vi.fn(async () => SIGNED),
}));

let listener: ((event: GuardEvent) => void) | null = null;

vi.mock("@/services/guard/guard_events", () => ({
  on_guard_event: (cb: (event: GuardEvent) => void) => {
    listener = cb;

    return () => {
      listener = null;
    };
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type Mocked = ReturnType<typeof vi.fn>;

function mock(fn: unknown): Mocked {
  return fn as Mocked;
}

const USER_ID = "33333333-4444-4555-8666-777777777777";
const RESCUE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const LATER = "2026-11-18T10:00:00Z";
const ACCOUNT_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ACCOUNT_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function by_test_id(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mock(api.guard_veto).mockReset();
  listener = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("GuardVetoPage", () => {
  it("clears the link and waits for a press before calling the server", async () => {
    window.history.replaceState(null, "", `/guard/veto?id=${RESCUE_ID}&t=tok_fake`);
    mock(api.guard_veto).mockImplementation(async () => {
      expect(window.location.search).toBe("");

      return { data: { status: "vetoed" } };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <GuardVetoPage />
        </MemoryRouter>,
      );
    });
    await flush();
    expect(window.location.search).toBe("");
    expect(api.guard_veto).not.toHaveBeenCalled();
    act(() => {
      (by_test_id("guard_veto_stop_button") as HTMLButtonElement).click();
    });
    await flush();

    expect(api.guard_veto).toHaveBeenCalledWith({ id: RESCUE_ID, t: "tok_fake" });
    expect(window.location.search).toBe("");
    expect(by_test_id("guard_veto_done")).not.toBeNull();
    expect(
      document.head.querySelector('meta[name="referrer"]')?.getAttribute("content"),
    ).toBe("no-referrer");
  });

  it("shows an expired link without calling the server", async () => {
    window.history.replaceState(null, "", "/guard/veto?id=only");

    act(() => {
      root.render(
        <MemoryRouter>
          <GuardVetoPage />
        </MemoryRouter>,
      );
    });
    await flush();

    expect(api.guard_veto).not.toHaveBeenCalled();
    expect(by_test_id("guard_veto_invalid")).not.toBeNull();
  });

  it("treats a used link as invalid", async () => {
    window.history.replaceState(null, "", `/guard/veto?id=${RESCUE_ID}&t=tok_fake`);
    mock(api.guard_veto).mockResolvedValueOnce({
      error: "gone",
      status: 410,
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <GuardVetoPage />
        </MemoryRouter>,
      );
    });
    await flush();
    act(() => {
      (by_test_id("guard_veto_stop_button") as HTMLButtonElement).click();
    });
    await flush();

    expect(by_test_id("guard_veto_invalid")).not.toBeNull();
  });

  it("lets the person try again after a network error", async () => {
    window.history.replaceState(null, "", `/guard/veto?id=${RESCUE_ID}&t=tok_fake`);
    mock(api.guard_veto)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { status: "vetoed" } });

    act(() => {
      root.render(
        <MemoryRouter>
          <GuardVetoPage />
        </MemoryRouter>,
      );
    });
    await flush();
    act(() => {
      (by_test_id("guard_veto_stop_button") as HTMLButtonElement).click();
    });
    await flush();
    expect(by_test_id("guard_veto_error")).not.toBeNull();
    act(() => {
      (by_test_id("guard_veto_stop_button") as HTMLButtonElement).click();
    });
    await flush();

    expect(api.guard_veto).toHaveBeenCalledTimes(2);
    expect(by_test_id("guard_veto_done")).not.toBeNull();
  });
});

describe("GuardRescueBanner", () => {
  it("stops a rescue with a signed veto", async () => {
    mock(api.guard_veto).mockResolvedValueOnce({ data: { status: "vetoed" } });

    act(() => {
      root.render(<GuardRescueBanner user_id={USER_ID} />);
    });
    expect(by_test_id("guard_rescue_banner")).toBeNull();

    act(() => {
      listener?.({ event: "rescue_started", id: RESCUE_ID, account_id: USER_ID });
    });
    expect(by_test_id("guard_rescue_banner")).not.toBeNull();

    act(() => (by_test_id("guard_rescue_stop") as HTMLButtonElement).click());
    await flush();

    expect(sign_guard_action).toHaveBeenCalledWith(
      DEVICE,
      USER_ID,
      GUARD_ACTION.veto,
      expect.any(Uint8Array),
      PROOF,
    );
    expect(api.guard_veto).toHaveBeenCalledWith({
      id: RESCUE_ID,
      action: SIGNED,
    });
    expect(container.textContent).toContain("guard.rescue_banner_stopped");
  });

  it("shows a full-width danger banner with a stop pill", () => {
    act(() => {
      root.render(<GuardRescueBanner user_id={USER_ID} />);
    });
    act(() => {
      listener?.({ event: "rescue_started", id: RESCUE_ID, account_id: USER_ID });
    });
    const banner = by_test_id("guard_rescue_banner") as HTMLElement;

    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.className).toContain("w-full");
    expect(banner.className).not.toContain("fixed");
    expect(by_test_id("guard_rescue_stop")?.tagName).toBe("BUTTON");
    expect(banner.textContent).toContain("guard.rescue_banner_stop");
  });

  it("ignores a rescue on another account", () => {
    act(() => {
      root.render(<GuardRescueBanner user_id={USER_ID} />);
    });
    act(() => {
      listener?.({
        event: "rescue_started",
        id: RESCUE_ID,
        account_id: "44444444-5555-4666-8777-888888888888",
      });
    });
    expect(by_test_id("guard_rescue_banner")).toBeNull();
  });
});

describe("GuardRescueProgress", () => {
  it("stores only the rescue id and its date", async () => {
    mock(api.guard_rescue_status).mockResolvedValue({
      data: { status: "pending", apply_after: LATER },
    });

    act(() => {
      root.render(
        <GuardRescueProgress
          rescue={{ rescue_id: RESCUE_ID, apply_after: LATER }}
          on_back={vi.fn()}
        />,
      );
    });
    await flush();

    expect(
      JSON.parse(window.localStorage.getItem(GUARD_RESCUE_STORAGE_KEY) ?? "{}"),
    ).toEqual({ rescue_id: RESCUE_ID, apply_after: LATER, account_id: null });
    expect(by_test_id("guard_rescue_waiting")).not.toBeNull();
  });

  it("checks again each minute and leads to sign-in when applied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-15T10:00:00Z"));
    const on_back = vi.fn();

    mock(api.guard_rescue_status)
      .mockResolvedValueOnce({ data: { status: "pending", apply_after: LATER } })
      .mockResolvedValueOnce({ data: { status: "applied", apply_after: LATER } });

    act(() => {
      root.render(
        <GuardRescueProgress
          rescue={{
            rescue_id: RESCUE_ID,
            apply_after: LATER,
            account_id: ACCOUNT_A,
          }}
          on_back={on_back}
        />,
      );
    });
    await flush();
    expect(api.guard_rescue_status).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(GUARD_RESCUE_POLL_MS);
    });
    await flush();

    expect(api.guard_rescue_status).toHaveBeenCalledTimes(2);
    expect(by_test_id("guard_rescue_applied")).not.toBeNull();
    expect(window.localStorage.getItem(GUARD_RESCUE_STORAGE_KEY)).toBeNull();

    act(() => (by_test_id("guard_rescue_sign_in") as HTMLButtonElement).click());
    expect(on_back).toHaveBeenCalled();
    expect(
      JSON.parse(
        window.sessionStorage.getItem(GUARD_SETUP_AFTER_RESCUE_KEY) ?? "{}",
      ).account_id,
    ).toBe(ACCOUNT_A);
    expect(take_setup_after_rescue(ACCOUNT_A)).toBe(true);
    expect(take_setup_after_rescue(ACCOUNT_A)).toBe(false);
  });

  it("opens setup after a rescue only for the rescued account", () => {
    const now = Date.parse("2026-11-15T10:00:00Z");

    mark_setup_after_rescue(ACCOUNT_A, now);
    expect(take_setup_after_rescue(ACCOUNT_B, now)).toBe(false);
    expect(take_setup_after_rescue(ACCOUNT_A, now)).toBe(false);

    mark_setup_after_rescue(ACCOUNT_A, now);
    expect(take_setup_after_rescue(ACCOUNT_A, now + 60_000)).toBe(true);
  });

  it("drops a stale or malformed setup marker", () => {
    const now = Date.parse("2026-11-15T10:00:00Z");

    mark_setup_after_rescue(ACCOUNT_A, now);
    expect(
      take_setup_after_rescue(ACCOUNT_A, now + GUARD_SETUP_AFTER_RESCUE_TTL_MS + 1),
    ).toBe(false);

    window.sessionStorage.setItem(GUARD_SETUP_AFTER_RESCUE_KEY, "1");
    expect(take_setup_after_rescue(ACCOUNT_A, now)).toBe(false);
    expect(window.sessionStorage.getItem(GUARD_SETUP_AFTER_RESCUE_KEY)).toBeNull();
  });

  it("keeps the rescued account with the stored rescue", () => {
    save_guard_rescue({
      rescue_id: RESCUE_ID,
      apply_after: LATER,
      account_id: ACCOUNT_A,
    });
    expect(load_guard_rescue()?.account_id).toBe(ACCOUNT_A);

    window.localStorage.setItem(
      GUARD_RESCUE_STORAGE_KEY,
      JSON.stringify({ rescue_id: RESCUE_ID, apply_after: LATER, account_id: "x" }),
    );
    expect(load_guard_rescue()?.account_id).toBeNull();
  });
});
