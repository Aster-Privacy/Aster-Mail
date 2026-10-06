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

const mocks = vi.hoisted(() => ({
  preferences: {
    auto_save_drafts: true,
    compose_mode: "rich_text",
    signature_mode: "off",
    show_badges_in_signature: false,
    show_aster_branding: false,
    low_network_mode: false,
  } as Record<string, unknown>,
  save_draft: vi.fn(),
  queued_email_id: null as string | null,
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
    default_signature: null,
    get_formatted_signature: () => "",
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
    save_draft: mocks.save_draft,
  },
}));
vi.mock("@/components/compose/use_compose_send", () => ({
  use_compose_send: () => ({
    handle_send: vi.fn(),
    handle_scheduled_send: vi.fn(),
    is_sending: false,
    pgp_enabled: false,
    toggle_pgp: vi.fn(),
    queued_email_id: mocks.queued_email_id,
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
import { set_pending_send_stash } from "./pending_send_stash";

import { draft_from_undone_send } from "@/components/toast/undone_send_draft";
import { escape_html } from "@/hooks/editor_utils";
import type { EditDraftData } from "@/components/compose/compose_shared";

const typed_text =
  "Use <project> & \"quotes\" 'here'\n\n  indented line\ttab\nÁgua, ação";
const stored_message = escape_html(typed_text).replace(/\n/g, "<br>");

let root: Root;
let hook: UseComposeReturn;
let editor_el: HTMLDivElement | null = null;

function Probe({ edit_draft }: { edit_draft: EditDraftData | null }) {
  hook = use_compose({
    on_close: () => {},
    edit_draft,
    session_storage_key: "compose-plain-draft",
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

function saved_draft(overrides: Partial<EditDraftData> = {}): EditDraftData {
  return {
    id: "draft-1",
    version: 3,
    draft_type: "new",
    to_recipients: ["alice@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "Notes",
    message: stored_message,
    updated_at: "2026-10-06T10:00:00.000Z",
    ...overrides,
  };
}

async function open(edit_draft: EditDraftData | null) {
  await act(async () => root.render(<Probe edit_draft={edit_draft} />));
  await act(async () => {
    vi.advanceTimersByTime(10);
  });
}

async function edit_subject_and_autosave() {
  await act(async () => hook.set_subject("Notes, edited"));
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.save_draft.mockReset();
  mocks.save_draft.mockResolvedValue({ success: true, id: "draft-1" });
  mocks.queued_email_id = null;
  mocks.preferences.compose_mode = "rich_text";
  editor_el = null;
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("reopening a draft in the compose window", () => {
  it("reopens a plain text draft in plain mode with the text as typed", async () => {
    await open(saved_draft({ is_plain_text: true }));

    expect(hook.is_plain_text_mode).toBe(true);
    expect(hook.message).toBe(typed_text);
    expect(editor_el?.textContent).toContain('Use <project> & "quotes"');
    expect(editor_el?.textContent).not.toMatch(/&(amp|lt|gt|quot|#039);/);
  });

  it("saves it again as the same plain text draft", async () => {
    await open(saved_draft({ is_plain_text: true }));
    await edit_subject_and_autosave();

    expect(mocks.save_draft).toHaveBeenCalled();
    const data = mocks.save_draft.mock.calls.at(-1)?.[1];

    expect(data).toMatchObject({
      subject: "Notes, edited",
      message: stored_message,
      is_plain_text: true,
    });
  });

  it("opens a draft without the field in rich mode, as before", async () => {
    await open(saved_draft({ message: "Hello<br>there" }));

    expect(hook.is_plain_text_mode).toBe(false);
    expect(hook.message).toBe("Hello<br>there");

    await edit_subject_and_autosave();

    expect(mocks.save_draft.mock.calls.at(-1)?.[1].is_plain_text).toBe(
      undefined,
    );
  });

  it("keeps the rich editor when a marked draft holds markup plain mode never writes", async () => {
    await open(
      saved_draft({ is_plain_text: true, message: "<div>Hello</div>" }),
    );

    expect(hook.is_plain_text_mode).toBe(false);
    expect(hook.message).toBe("<div>Hello</div>");
  });

  it("saves the mode when only the mode changes", async () => {
    await open(saved_draft({ message: "Hello" }));
    editor_el!.innerText = "Hello";
    await act(async () => hook.toggle_plain_text_mode());
    await act(async () => hook.confirm_plain_text_mode());
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(mocks.save_draft.mock.calls.at(-1)?.[1]).toMatchObject({
      message: "Hello",
      is_plain_text: true,
    });
  });
});

describe("undo send", () => {
  it("restores a plain text message in plain mode", async () => {
    const restored = draft_from_undone_send(
      {
        id: "queued-1",
        to: ["alice@example.com"],
        subject: "Notes",
        body: stored_message,
        scheduled_time: 0,
        total_seconds: 10,
      },
      {
        to: ["alice@example.com"],
        subject: "Notes",
        body: stored_message,
        is_plain_text: true,
      },
    );

    await open(restored);

    expect(hook.is_plain_text_mode).toBe(true);
    expect(hook.message).toBe(typed_text);
  });

  it("restores a plain text message into the open window in plain mode", async () => {
    mocks.queued_email_id = "queued-2";
    await open(null);
    set_pending_send_stash("compose-plain-draft", {
      to_recipients: ["alice@example.com"],
      cc_recipients: [],
      bcc_recipients: [],
      subject: "Notes",
      message: stored_message,
      is_plain_text: true,
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("astermail:undo-send", {
          detail: { id: "queued-2", pending: {} },
        }),
      );
    });

    expect(hook.is_plain_text_mode).toBe(true);
    expect(hook.message).toBe(typed_text);
  });
});
