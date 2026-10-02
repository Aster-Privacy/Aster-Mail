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

const get_alias_delivery_log = vi.fn();
const get_domain_address_delivery_log = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/aliases", () => ({
  get_alias_delivery_log: (...args: unknown[]) =>
    get_alias_delivery_log(...args),
  get_domain_address_delivery_log: (...args: unknown[]) =>
    get_domain_address_delivery_log(...args),
}));

const { DeliveryLogPanel } = await import("./delivery_log");

const EMPTY = "settings.alias_delivery_log_empty";
const FAILED = "common.something_went_wrong_try_again";

let container: HTMLDivElement;
let root: Root;

async function mount(props: { alias_id?: string; domain_address_id?: string }) {
  await act(async () => {
    root.render(<DeliveryLogPanel {...props} />);
  });
}

describe("DeliveryLogPanel", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    get_alias_delivery_log.mockReset();
    get_domain_address_delivery_log.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the empty state when the log has no events", async () => {
    get_alias_delivery_log.mockResolvedValue({
      data: { events: [], total: 0 },
    });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(EMPTY);
    expect(container.textContent).not.toContain(FAILED);
  });

  it("shows the empty state when the server answers with no body", async () => {
    get_alias_delivery_log.mockResolvedValue({ data: undefined });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(EMPTY);
    expect(container.textContent).not.toContain(FAILED);
  });

  it("shows the empty state when the body is null", async () => {
    get_alias_delivery_log.mockResolvedValue({ data: null });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(EMPTY);
    expect(container.textContent).not.toContain(FAILED);
  });

  it("shows the empty state when a domain address has no log yet", async () => {
    get_domain_address_delivery_log.mockResolvedValue({
      error: "Not found",
      code: "NOT_FOUND",
      status: 404,
    });
    await mount({ domain_address_id: "d1" });

    expect(container.textContent).toContain(EMPTY);
    expect(container.textContent).not.toContain(FAILED);
  });

  it("still shows the error with a retry for a server failure", async () => {
    get_alias_delivery_log.mockResolvedValue({
      error: "Server error",
      code: "SERVER_ERROR",
      status: 500,
    });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(FAILED);
    expect(container.textContent).toContain("common.retry");
    expect(container.textContent).not.toContain(EMPTY);
  });

  it("still shows the error when the request is rejected", async () => {
    get_alias_delivery_log.mockResolvedValue({
      error: "Forbidden",
      code: "FORBIDDEN",
      status: 403,
    });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(FAILED);
    expect(container.textContent).not.toContain(EMPTY);
  });

  it("lists blocked events", async () => {
    get_alias_delivery_log.mockResolvedValue({
      data: {
        events: [
          {
            id: "e1",
            blocked_reason: "sender_pin",
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
      },
    });
    await mount({ alias_id: "a1" });

    expect(container.textContent).toContain(
      "settings.alias_delivery_log_reason_sender_pin",
    );
    expect(container.textContent).not.toContain(EMPTY);
  });
});
