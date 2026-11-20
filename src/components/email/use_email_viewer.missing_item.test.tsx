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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  code: "NOT_FOUND" as string,
  status: 404 as number,
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
  get_mail_item: async () => ({
    data: null,
    error: "request failed",
    code: h.code,
    status: h.status,
  }),
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
  request_cache: { clear: vi.fn(), invalidate: vi.fn() },
}));

vi.mock("@/hooks/use_mail_stats", () => ({ adjust_stats_unread: vi.fn() }));

const { use_email_viewer } =
  await import("@/components/email/use_email_viewer");

function render_hook(on_dismiss: () => void): {
  errors: (string | null)[];
  loading: boolean[];
  root: Root;
} {
  const errors: (string | null)[] = [];
  const loading: boolean[] = [];

  function Harness() {
    const view = use_email_viewer({ email_id: "gone", on_dismiss });

    errors.push(view.error);
    loading.push(view.is_loading);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { errors, loading, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("the reading pane opening a message that no longer exists", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes the pane quietly when the server reports the message is gone", async () => {
    h.code = "NOT_FOUND";
    h.status = 404;
    const on_dismiss = vi.fn();
    const { errors, loading, root } = render_hook(on_dismiss);

    await flush();

    expect(on_dismiss).toHaveBeenCalledTimes(1);
    expect(errors.every((value) => value === null)).toBe(true);
    expect(loading.at(-1)).toBe(false);

    act(() => root.unmount());
  });

  it("still shows the error for other failures", async () => {
    h.code = "SERVER_ERROR";
    h.status = 500;
    const on_dismiss = vi.fn();
    const { errors, root } = render_hook(on_dismiss);

    await flush();

    expect(on_dismiss).not.toHaveBeenCalled();
    expect(errors.at(-1)).toBe("common.failed_to_load_email");

    act(() => root.unmount());
  });
});
