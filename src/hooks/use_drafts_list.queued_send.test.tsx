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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const list_drafts_with_content = vi.fn();

vi.mock("@/services/api/multi_drafts", () => ({
  list_drafts_with_content: (...args: unknown[]) =>
    list_drafts_with_content(...args),
  delete_draft: vi.fn(),
}));

vi.mock("@/services/api/undo_send", () => ({
  undo_send_api: { get_status: vi.fn() },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "vault" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    has_keys: true,
    is_loading: false,
    is_authenticated: true,
  }),
}));

const preferences = { date_format: "MM/DD/YYYY", time_format: "12h" };

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences }),
}));

const t = (key: string) => key;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t }),
}));

vi.mock("./use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
  adjust_stats_drafts: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

const { use_drafts_list, clear_drafts_cache } =
  await import("./use_drafts_list");
const { remember_queued_send_draft, forget_queued_send_draft } =
  await import("@/services/queued_send_drafts");

function server_draft(id: string) {
  return {
    id,
    version: 1,
    draft_type: "new",
    updated_at: "2026-11-10T10:00:00.000Z",
    content: {
      to_recipients: ["someone@example.com"],
      cc_recipients: [],
      bcc_recipients: [],
      subject: `subject ${id}`,
      message: "body",
    },
  };
}

let root: Root | null = null;
let shown_ids: string[] = [];

function Probe() {
  shown_ids = use_drafts_list(true).state.drafts.map((draft) => draft.id);

  return null;
}

async function mount_list() {
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root?.render(createElement(Probe));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("drafts list while a send is queued", () => {
  beforeEach(() => {
    localStorage.clear();
    clear_drafts_cache();
    shown_ids = [];
    list_drafts_with_content.mockResolvedValue({
      data: {
        drafts: [server_draft("d1"), server_draft("d2")],
        has_more: false,
      },
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  it("leaves out the draft of a message that is being sent", async () => {
    remember_queued_send_draft("q1", "d1");

    await mount_list();

    expect(shown_ids).toEqual(["d2"]);
  });

  it("hides the draft at hand-off and shows it again after an undo", async () => {
    await mount_list();

    expect(shown_ids).toEqual(["d1", "d2"]);

    act(() => remember_queued_send_draft("q1", "d1"));

    expect(shown_ids).toEqual(["d2"]);

    act(() => forget_queued_send_draft("q1"));

    expect(shown_ids).toEqual(["d1", "d2"]);
  });
});
