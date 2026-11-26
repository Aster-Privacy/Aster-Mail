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
import type { CustomDomain } from "@/services/api/domains";
import type { MtaStsView } from "@/services/api/mta_sts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const stable = vi.hoisted(() => ({
  i18n: {
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  },
}));

const api = vi.hoisted(() => ({
  get_mta_sts: vi.fn(),
  enable_mta_sts: vi.fn(),
  disable_mta_sts: vi.fn(),
  check_mta_sts: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable.i18n,
}));

vi.mock("@/services/api/mta_sts", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/mta_sts")>()),
  ...api,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div data-testid="modal">{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    on_confirm,
  }: {
    is_open: boolean;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <button data-testid="confirm-off" type="button" onClick={on_confirm}>
        confirm
      </button>
    ) : null,
}));

const { MtaStsModal } = await import("./mta_sts_modal");

const domain = {
  id: "d1",
  domain_name: "example.com",
  status: "active",
} as CustomDomain;

function make_view(overrides: Partial<MtaStsView> = {}): MtaStsView {
  return {
    available: true,
    entitled: true,
    state: "off",
    enabled: false,
    domain_active: true,
    mode: null,
    policy_url: null,
    preview: null,
    max_age: null,
    records: [],
    hostname_status: null,
    retire_until: null,
    last_checked_at: null,
    managed_by_registrar: false,
    ...overrides,
  };
}

const live_view = make_view({
  state: "live",
  enabled: true,
  mode: "testing",
  policy_url: "https://mta-sts.example.com/.well-known/mta-sts.txt",
  preview: "version: STSv1\r\nmode: testing\r\n",
  hostname_status: "active",
  records: [
    {
      kind: "policy_host",
      record_type: "CNAME",
      host: "mta-sts",
      fqdn: "mta-sts.example.com",
      value: "mta-sts.example.net",
      status: "ok",
      optional: false,
    },
  ],
});

let container: HTMLDivElement;
let root: Root;
let on_close: ReturnType<typeof vi.fn>;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render_open() {
  act(() => {
    root.render(
      <MtaStsModal is_open domain={domain} on_close={on_close as never} />,
    );
  });
  await flush();
}

function by_testid(id: string): HTMLElement {
  const found = container.querySelector(`[data-testid="${id}"]`);

  if (!found) throw new Error(`missing ${id}`);

  return found as HTMLElement;
}

function button_with_text(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );

  if (!found) throw new Error(`missing button ${text}`);

  return found;
}

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  on_close = vi.fn();
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("MtaStsModal", () => {
  it("turns on MTA-STS in testing mode by default", async () => {
    api.get_mta_sts.mockResolvedValue({ data: make_view() });
    api.enable_mta_sts.mockResolvedValue({
      data: make_view({ state: "pending_dns", enabled: true, mode: "testing" }),
    });
    await render_open();

    expect(by_testid("mta-sts-setup")).toBeTruthy();
    await act(async () => by_testid("mta-sts-turn-on").click());
    await flush();

    expect(api.enable_mta_sts).toHaveBeenCalledWith("d1", "testing");
    expect(by_testid("mta-sts-manage")).toBeTruthy();

    act(() => button_with_text("common.done").click());
    expect(on_close).toHaveBeenCalledWith(true);
  });

  it("blocks setup on an unverified domain", async () => {
    api.get_mta_sts.mockResolvedValue({
      data: make_view({ domain_active: false }),
    });
    await render_open();

    expect(container.textContent).toContain(
      "settings.mta_sts_error_not_verified",
    );
    expect((by_testid("mta-sts-turn-on") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows the live policy and its preview", async () => {
    api.get_mta_sts.mockResolvedValue({ data: live_view });
    await render_open();

    expect(container.textContent).toContain(
      'settings.mta_sts_live_message:{"url":"https://mta-sts.example.com/.well-known/mta-sts.txt"}',
    );
    expect(by_testid("mta-sts-preview").textContent).toContain("STSv1");
    expect(by_testid("mta-sts-record-policy_host").textContent).toContain(
      "mta-sts.example.net",
    );
    expect(container.querySelector('[data-testid="mta-sts-save-mode"]')).toBe(
      null,
    );
  });

  it("shows the server error when an action fails", async () => {
    api.get_mta_sts.mockResolvedValue({ data: make_view() });
    api.enable_mta_sts.mockResolvedValue({
      error: "conflict",
      server_code: "MTA_STS_RECORD_CONFLICT",
    });
    await render_open();
    await act(async () => by_testid("mta-sts-turn-on").click());
    await flush();

    expect(container.textContent).toContain(
      "settings.mta_sts_error_record_conflict",
    );
    expect(by_testid("mta-sts-setup")).toBeTruthy();
  });

  it("reloads the saved state when the records could not be updated", async () => {
    api.get_mta_sts
      .mockResolvedValueOnce({ data: make_view() })
      .mockResolvedValueOnce({ data: make_view({ state: "pending_dns" }) });
    api.enable_mta_sts.mockResolvedValue({
      error: "registrar",
      server_code: "MTA_STS_REGISTRAR_FAILED",
    });
    await render_open();
    await act(async () => by_testid("mta-sts-turn-on").click());
    await flush();

    expect(api.get_mta_sts).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("settings.mta_sts_error_registrar");
    expect(by_testid("mta-sts-manage")).toBeTruthy();
  });

  it("turns off through the confirmation and returns to setup", async () => {
    api.get_mta_sts.mockResolvedValue({ data: live_view });
    api.disable_mta_sts.mockResolvedValue({
      data: make_view({
        state: "retiring",
        retire_until: "2026-12-03T00:00:00Z",
      }),
    });
    await render_open();

    act(() => button_with_text("settings.mta_sts_turn_off").click());
    await act(async () => by_testid("confirm-off").click());
    await flush();

    expect(api.disable_mta_sts).toHaveBeenCalledWith("d1");
    expect(by_testid("mta-sts-setup")).toBeTruthy();
    expect(container.textContent).toContain(
      "settings.mta_sts_retiring_message",
    );
  });

  it("offers a retry when loading fails", async () => {
    api.get_mta_sts.mockResolvedValue({ error: "boom" });
    await render_open();

    expect(container.querySelector('[data-testid="mta-sts-setup"]')).toBe(null);
    expect(container.querySelector('[data-testid="mta-sts-manage"]')).toBe(
      null,
    );
  });
});
