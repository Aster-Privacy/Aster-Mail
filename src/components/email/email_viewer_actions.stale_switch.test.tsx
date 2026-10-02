//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { EmailViewerActionsDeps } from "@/components/email/email_viewer_actions";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

let release_update: (() => void) | null = null;

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: async () => {
    await new Promise<void>((resolve) => {
      release_update = resolve;
    });

    return { success: true, encrypted: null };
  },
  bulk_update_metadata_by_ids: async () => ({ success: true }),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  adjust_stats_spam: vi.fn(),
  adjust_stats_trash: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

const { use_email_viewer_actions } =
  await import("@/components/email/email_viewer_actions");

type Actions = ReturnType<typeof use_email_viewer_actions>;

type Rendered = {
  root: Root;
  open: (id: string) => void;
  actions: () => Actions;
  on_dismiss: ReturnType<typeof vi.fn>;
  set_is_read: ReturnType<typeof vi.fn>;
  set_is_pinned: ReturnType<typeof vi.fn>;
  set_mail_item: ReturnType<typeof vi.fn>;
};

function mail_item(id: string) {
  return {
    id,
    item_type: "received",
    encrypted_metadata: "meta",
    metadata_nonce: "nonce",
    metadata_version: 1,
    metadata: { is_read: true, is_pinned: false },
  } as unknown as EmailViewerActionsDeps["mail_item"];
}

function render_hook(initial_id: string): Rendered {
  const on_dismiss = vi.fn();
  const set_is_read = vi.fn();
  const set_is_pinned = vi.fn();
  const set_mail_item = vi.fn();
  let latest!: Actions;
  let set_id: (id: string) => void = () => {};

  function Harness() {
    const [email_id, set_email_id] = useState(initial_id);

    set_id = set_email_id;
    latest = use_email_viewer_actions({
      email_id,
      email: null,
      mail_item: mail_item(email_id),
      is_read: true,
      is_pinned: false,
      is_archive_loading: false,
      is_spam_loading: false,
      is_trash_loading: false,
      is_pin_loading: false,
      is_external: false,
      thread_messages: [],
      current_user_email: "me@astermail.org",
      thread_ghost_email: undefined,
      set_is_read,
      set_is_pinned,
      set_is_archive_loading: () => {},
      set_is_spam_loading: () => {},
      set_is_trash_loading: () => {},
      set_is_pin_loading: () => {},
      set_mail_item,
      set_thread_messages: () => {},
      set_thread_draft: () => {},
      set_view_source_message: () => {},
      on_dismiss,
      t: (key) => key,
      format_email_detail: () => "",
      preferences_default_reply_behavior: "reply",
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return {
    root,
    open: (id) => act(() => set_id(id)),
    actions: () => latest,
    on_dismiss,
    set_is_read,
    set_is_pinned,
    set_mail_item,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

describe("viewer actions that finish after another message opens", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    release_update = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not close the newly opened message when an older mark-unread lands", async () => {
    const rendered = render_hook("a1");

    void rendered.actions().handle_read_toggle();
    await flush();
    expect(release_update).not.toBeNull();
    expect(rendered.set_is_read).toHaveBeenCalledTimes(1);

    rendered.open("b1");
    act(() => release_update?.());
    await flush();

    expect(rendered.on_dismiss).not.toHaveBeenCalled();
    expect(rendered.set_is_read).toHaveBeenCalledTimes(1);

    act(() => rendered.root.unmount());
  });

  it("still closes the message that stays open after mark-unread", async () => {
    const rendered = render_hook("a1");

    void rendered.actions().handle_read_toggle();
    await flush();
    act(() => release_update?.());
    await flush();

    expect(rendered.on_dismiss).toHaveBeenCalledTimes(1);

    act(() => rendered.root.unmount());
  });

  it("does not write a pin result onto the newly opened message", async () => {
    const rendered = render_hook("a1");

    void rendered.actions().handle_pin_toggle();
    await flush();
    expect(rendered.set_is_pinned).toHaveBeenCalledWith(true);
    expect(rendered.set_mail_item).not.toHaveBeenCalled();

    rendered.open("b1");
    act(() => release_update?.());
    await flush();

    expect(rendered.set_mail_item).not.toHaveBeenCalled();

    act(() => rendered.root.unmount());
  });
});
