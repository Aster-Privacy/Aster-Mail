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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const SIGNATURE_HTML = '<div data-aster-signature="1">Best regards, Dana</div>';

const mocks = vi.hoisted(() => ({
  preferences: {
    auto_save_drafts: true,
    compose_mode: "rich_text",
    signature_mode: "auto",
    show_badges_in_signature: false,
    show_aster_branding: false,
    low_network_mode: false,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mocks.preferences }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" }, vault: {} }),
}));
vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => ({
    default_signature: { id: "sig-1", name: "Work", content: "Best regards" },
    get_formatted_signature: () =>
      '<div data-aster-signature="1">Best regards, Dana</div>',
    resolve_signature: () => null,
  }),
}));
vi.mock("@/stores/my_badge_prefs_store", () => ({
  use_my_badge_prefs: () => null,
}));
vi.mock("@/services/api/user", () => ({
  fetch_my_badges: async () => ({ data: [] }),
}));
vi.mock("@/hooks/use_suggestion_contacts", () => ({
  use_suggestion_contacts: () => [],
}));
vi.mock("@/services/api/recent_recipients", () => ({
  list_recent_recipients: async () => ({ data: null }),
  decrypt_recent_recipients: async () => [],
}));
vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [], loading: false }),
  is_signature_bindable_sender_type: () => false,
}));
vi.mock("@/hooks/use_preferred_sender_ready", () => ({
  use_preferred_sender_ready: () => true,
}));
vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => ({ is_ghost_enabled: false }),
}));
vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding: () => vi.fn(),
}));
vi.mock("@/services/recipient_classification", () => ({
  begin_recipient_classification_session: vi.fn(),
  is_internal_recipient: () => true,
  use_recipient_classification: vi.fn(),
}));
vi.mock("@/services/crypto/encrypted_drafts", () => ({
  draft_manager: {
    load_context: () => "context-1",
    create_context: () => "context-1",
    clear_context: vi.fn(),
    get_context: () => null,
    await_pending_save: async () => {},
    delete_draft: async () => {},
    save_draft: vi.fn(async () => ({ success: true, id: "draft-1" })),
  },
}));
vi.mock("@/components/compose/use_compose_send", () => ({
  use_compose_send: () => ({
    handle_send: vi.fn(),
    handle_scheduled_send: vi.fn(),
    is_sending: false,
    pgp_enabled: false,
    toggle_pgp: vi.fn(),
    queued_email_id: null,
    set_queued_email_id: vi.fn(),
  }),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: {}, is_feature_locked: () => false }),
}));
vi.mock("@/services/forward_attachments", () => ({
  load_forward_attachments: async () => [],
}));
vi.mock("@/services/api/csrf", () => ({ has_csrf_token: () => true }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

import { use_compose, type UseComposeReturn } from "./use_compose";

import { draft_from_undone_send } from "@/components/toast/undone_send_draft";

import type { EditDraftData } from "@/components/compose/compose_shared";
import type { PendingSendPayload } from "@/hooks/use_undo_send";

let root: Root;
let hook: UseComposeReturn;
let editor_el: HTMLDivElement | null = null;

function Probe({ edit_draft }: { edit_draft: EditDraftData }) {
  hook = use_compose({
    on_close: () => {},
    edit_draft,
    session_storage_key: "compose-undo-signature",
  });

  return (
    <div
      ref={(el) => {
        editor_el = el;
        (
          hook.message_textarea_ref as { current: HTMLDivElement | null }
        ).current = el;
      }}
      contentEditable
    />
  );
}

function undone_reply(body: string, restore_verbatim = true): EditDraftData {
  const payload: PendingSendPayload = {
    to: ["alice@example.com"],
    subject: "Re: Plans",
    body,
    draft_type: "reply",
    reply_to_id: "mail-1",
    thread_token: "thread-1",
    restore_verbatim,
  };

  return draft_from_undone_send(
    {
      id: "queued-1",
      to: payload.to,
      subject: payload.subject,
      body,
      scheduled_time: 0,
      total_seconds: 10,
    },
    payload,
  );
}

async function open(edit_draft: EditDraftData) {
  await act(async () => root.render(<Probe edit_draft={edit_draft} />));
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
  }
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  editor_el = null;
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("undo of a reply sent from the compose window", () => {
  it("restores a rich reply with its signature once", async () => {
    const sent =
      "<div>Sounds good</div><div><br></div>" +
      SIGNATURE_HTML +
      '<br><br><div class="aster_quote"><blockquote>Older text</blockquote></div>';

    await open(undone_reply(sent));

    expect(count(editor_el!.innerHTML, "data-aster-signature")).toBe(1);
    expect(count(editor_el!.textContent ?? "", "Best regards, Dana")).toBe(1);
    expect(count(hook.message, "Best regards, Dana")).toBe(1);
    expect(editor_el!.textContent).toContain("Sounds good");
    expect(editor_el!.textContent).toContain("Older text");
  });

  it("restores a plain text reply with its signature once", async () => {
    const sent =
      "Sounds good<br><br>Best regards, Dana<br><br>On Monday, Bo wrote:<br>&gt; Older text";

    await open(undone_reply(sent));

    expect(editor_el!.innerHTML).not.toContain("data-aster-signature");
    expect(count(editor_el!.textContent ?? "", "Best regards, Dana")).toBe(1);
    expect(count(hook.message, "Best regards, Dana")).toBe(1);
  });

  it("still adds the signature to a fresh reply", async () => {
    await open(
      undone_reply(
        '<br><br><div class="aster_quote"><blockquote>Older text</blockquote></div>',
        false,
      ),
    );

    expect(count(editor_el!.innerHTML, "data-aster-signature")).toBe(1);
  });
});
