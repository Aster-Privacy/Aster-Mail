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

const get_mock = vi.fn();
const post_mock = vi.fn();
const logout_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ is_authenticated: true, logout: logout_mock }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
  },
}));

const { PENDING_DELETION_EVENT, PENDING_DELETION_SERVER_CODE } = await import(
  "@/services/api/client/helpers"
);
const { PendingDeletionDialog } = await import("./pending_deletion_dialog");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PendingDeletionDialog />);
  });

  return container;
}

function button_with(text: string): HTMLButtonElement {
  const match = Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) => element.textContent === text,
  );

  expect(match).toBeTruthy();

  return match as HTMLButtonElement;
}

beforeEach(() => {
  get_mock.mockReset();
  post_mock.mockReset();
  logout_mock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("pending deletion gate", () => {
  it("stays hidden for an account that is not scheduled for deletion", async () => {
    get_mock.mockResolvedValue({ data: { status: "active" } });

    const element = await render();

    expect(element.textContent).toBe("");
  });

  it("shows the gate when the status endpoint is blocked by the deletion 403", async () => {
    get_mock.mockResolvedValue({
      error: "this account is scheduled for deletion",
      code: "FORBIDDEN",
      server_code: PENDING_DELETION_SERVER_CODE,
    });

    const element = await render();

    expect(element.textContent).toContain("common.pending_deletion_title");
    expect(element.textContent).toContain("common.pending_deletion_body");
    button_with("common.pending_deletion_keep");
    button_with("common.pending_deletion_sign_out");
  });

  it("shows the day count when the status endpoint answers", async () => {
    get_mock.mockResolvedValue({
      data: {
        status: "pending_deletion",
        deletion_scheduled_at: "2026-09-01T00:00:00Z",
        days_until_deletion: 21,
      },
    });

    const element = await render();

    expect(element.textContent).toContain("common.pending_deletion_days:21");
  });

  it("shows the gate when any other request reports the deletion 403", async () => {
    get_mock.mockResolvedValue({ error: "network", code: "NETWORK_ERROR" });

    const element = await render();

    expect(element.textContent).toBe("");

    await act(async () => {
      window.dispatchEvent(new Event(PENDING_DELETION_EVENT));
    });

    expect(element.textContent).toContain("common.pending_deletion_title");
  });

  it("cancels the deletion when you keep the account", async () => {
    get_mock.mockResolvedValue({ server_code: PENDING_DELETION_SERVER_CODE });
    post_mock.mockResolvedValue({ data: { success: true } });

    const reload = vi.fn();
    const original = window.location;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });

    await render();

    await act(async () => {
      button_with("common.pending_deletion_keep").click();
    });

    expect(post_mock).toHaveBeenCalledWith(
      "/core/v1/account/cancel-deletion",
      {},
    );
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("reports a failure to cancel and keeps the gate up", async () => {
    get_mock.mockResolvedValue({ server_code: PENDING_DELETION_SERVER_CODE });
    post_mock.mockResolvedValue({ error: "nope", code: "SERVER_ERROR" });

    const element = await render();

    await act(async () => {
      button_with("common.pending_deletion_keep").click();
    });

    expect(element.textContent).toContain("common.pending_deletion_error");
    expect(element.textContent).toContain("common.pending_deletion_title");
  });

  it("signs you out from the gate", async () => {
    get_mock.mockResolvedValue({ server_code: PENDING_DELETION_SERVER_CODE });
    logout_mock.mockResolvedValue(undefined);

    const element = await render();

    await act(async () => {
      button_with("common.pending_deletion_sign_out").click();
    });

    expect(logout_mock).toHaveBeenCalledTimes(1);
    expect(element.textContent).toBe("");
  });

  it("offers no way to dismiss the gate", async () => {
    get_mock.mockResolvedValue({ server_code: PENDING_DELETION_SERVER_CODE });

    const element = await render();

    expect(element.querySelectorAll("button").length).toBe(2);
    expect(sessionStorage.getItem("aster_deletion_dismissed")).toBeNull();
  });
});
