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
import type { ApiResponse } from "@/services/api/client";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { InlineReplySection } from "./inline_reply_section";

import {
  create_draft,
  delete_draft,
  type Draft,
} from "@/services/api/multi_drafts";
import { send_reply } from "@/services/mail_actions";

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: vi.fn(),
  update_draft: vi.fn(),
  delete_draft: vi.fn(() => Promise.resolve({ data: true })),
}));

vi.mock("@/services/mail_actions", () => ({
  send_reply: vi.fn(),
  cancel_mail_action: vi.fn(),
  send_mail_now: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ key: "vault" }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: unknown }) => (
          <div {...(rest as object)}>{children as never}</div>
        ),
    },
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children, ...rest }: { children?: unknown }) => (
    <button {...(rest as object)}>{children as never}</button>
  ),
}));

vi.mock("@heroicons/react/24/outline", () => ({
  XMarkIcon: () => <span />,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

vi.mock("@/components/compose/emoji_picker", () => ({
  default: () => <span />,
}));

vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <span /> }));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org", display_name: "Me" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { signature_mode: "off" } }),
}));

vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => ({
    default_signature: null,
    get_formatted_signature: () => "",
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/mail_events", () => ({ emit_thread_reply_sent: vi.fn() }));

vi.mock("@/components/compose/send_lock", () => ({
  build_send_fingerprint: () => "fingerprint",
  forget_send: vi.fn(),
  is_duplicate_send: () => false,
  record_send: vi.fn(),
}));

vi.mock("@/components/compose/compose_shared", () => ({
  get_aster_footer: () => "",
}));

vi.mock("@/components/compose/compose_draft_helpers", () => ({
  build_badge_html: () => "",
}));

vi.mock("@/services/api/user", () => ({
  fetch_my_badges: vi.fn(() => Promise.resolve({ data: [] })),
}));

vi.mock("@/stores/my_badge_prefs_store", () => ({
  use_my_badge_prefs: () => ({ inline_reply_badge_id: null }),
}));

vi.mock("@/lib/reply_subject", () => ({
  build_reply_subject: (subject: string) => subject,
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: vi.fn() }));

vi.mock("@/utils/ime", () => ({ is_composing: () => false }));

const mocked_create = vi.mocked(create_draft);
const mocked_delete = vi.mocked(delete_draft);
const mocked_send = vi.mocked(send_reply);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("InlineReplySection draft race on send", () => {
  let container: HTMLDivElement;
  let root: Root;

  const type_text = async (text: string) => {
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;

    await act(async () => {
      setter?.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const click_send = async () => {
    const send = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "mail.send",
    );

    if (!send) throw new Error("send button not found");

    await act(async () => {
      send.click();
    });
  };

  const render_section = async () => {
    await act(async () => {
      root.render(
        <InlineReplySection
          body="original body"
          email_id="email_1"
          is_visible={true}
          on_close={vi.fn()}
          on_reply_sent={vi.fn()}
          sender_email="them@example.com"
          sender_name="Them"
          subject="Subject"
          thread_token="thread_1"
          timestamp={new Date().toISOString()}
        />,
      );
    });
  };

  const make_draft = (id: string): Draft => ({
    id,
    draft_type: "reply",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    expires_at: "2026-02-01T00:00:00Z",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_send.mockResolvedValue({ success: true, queued_id: "queued_1" });
    mocked_delete.mockResolvedValue({ data: { success: true } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not save a draft when the reply is sent before autosave fires", async () => {
    mocked_create.mockResolvedValue({ data: make_draft("draft_late") });

    await render_section();
    await type_text("a quick reply");
    await click_send();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mocked_create).not.toHaveBeenCalled();
  });

  it("deletes a draft that is created after the reply was sent", async () => {
    let resolve_create: (value: ApiResponse<Draft>) => void = () => {};

    mocked_create.mockReturnValue(
      new Promise((resolve) => {
        resolve_create = resolve;
      }),
    );

    await render_section();
    await type_text("a slower reply");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mocked_create).toHaveBeenCalledTimes(1);

    await click_send();

    expect(mocked_send).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve_create({ data: make_draft("draft_inflight") });
    });

    expect(mocked_delete).toHaveBeenCalledWith("draft_inflight");
  });
});
