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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  payload_unavailable: true as boolean | undefined,
  get_mail_item: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async () => null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  are_keys_ready: () => true,
  on_keys_ready: (callback: () => void) => {
    callback();

    return () => {};
  },
  get_vault_from_memory: () => null,
  wait_for_keys_ready: async () => true,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: h.get_mail_item,
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  await_preloaded_email: async () => null,
  delete_preloaded_email: vi.fn(),
  get_preloaded_email: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({
    format_email_detail: () => "",
    format_email_list: () => "",
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { conversation_grouping: true, mark_as_read_delay: "never" },
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" } }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null, is_feature_locked: () => false }),
}));

vi.mock("@/components/email/email_viewer_actions", () => ({
  use_email_viewer_actions: () => ({}),
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { clear: vi.fn(), invalidate: h.invalidate },
}));

vi.mock("@/hooks/use_mail_stats", () => ({ adjust_stats_unread: vi.fn() }));

const { use_email_viewer } =
  await import("@/components/email/use_email_viewer");

interface ViewSnapshot {
  error: string | null;
  payload_unavailable: boolean;
  decrypt_failed: boolean;
}

function render_hook(): {
  snapshots: ViewSnapshot[];
  retry: () => void;
  root: Root;
} {
  const snapshots: ViewSnapshot[] = [];
  let retry: () => void = () => {};

  function Harness() {
    const view = use_email_viewer({ email_id: "flagged", on_dismiss: vi.fn() });

    snapshots.push({
      error: view.error,
      payload_unavailable: view.payload_unavailable,
      decrypt_failed: view.decrypt_failed,
    });
    retry = view.retry_load;

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { snapshots, retry: () => retry(), root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("the reading pane opening a message whose body could not be fetched", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.get_mail_item.mockReset();
    h.invalidate.mockReset();
    h.get_mail_item.mockImplementation(async () => ({
      data: {
        id: "flagged",
        item_type: "received",
        encrypted_envelope: "",
        envelope_nonce: "",
        ...(h.payload_unavailable === undefined
          ? {}
          : { payload_unavailable: h.payload_unavailable }),
      },
    }));
  });

  it("shows the temporarily unavailable state and refetches on retry", async () => {
    h.payload_unavailable = true;
    const { snapshots, retry, root } = render_hook();

    await flush();

    expect(snapshots.at(-1)).toEqual({
      error: "common.message_temporarily_unavailable",
      payload_unavailable: true,
      decrypt_failed: false,
    });
    expect(h.get_mail_item).toHaveBeenCalledTimes(1);

    act(() => retry());
    await flush();

    expect(h.invalidate).toHaveBeenCalledWith("/mail/v1/messages/flagged");
    expect(h.get_mail_item).toHaveBeenCalledTimes(2);
    expect(snapshots.at(-1)?.payload_unavailable).toBe(true);

    act(() => root.unmount());
  });

  it("keeps the data missing message for an empty envelope without the flag", async () => {
    h.payload_unavailable = undefined;
    const { snapshots, root } = render_hook();

    await flush();

    expect(snapshots.at(-1)).toEqual({
      error: "common.email_data_missing",
      payload_unavailable: false,
      decrypt_failed: false,
    });

    act(() => root.unmount());
  });

  it("treats an explicit false flag like a missing flag", async () => {
    h.payload_unavailable = false;
    const { snapshots, root } = render_hook();

    await flush();

    expect(snapshots.at(-1)?.error).toBe("common.email_data_missing");
    expect(snapshots.at(-1)?.payload_unavailable).toBe(false);

    act(() => root.unmount());
  });
});
