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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const toolbar_states: ComposeToolbarState[] = [];

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_compose_paste: (html: string) => html,
  sanitize_html: (html: string) => ({ html }),
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => "",
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "lockdown_changed",
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/compose/expiration_picker", () => ({
  ExpirationPicker: () => null,
}));

vi.mock("@/components/compose/schedule_picker", () => ({
  SchedulePicker: () => null,
}));

vi.mock("@/components/compose/template_picker", () => ({
  TemplatePicker: () => null,
}));

vi.mock("@/components/compose/signature_picker", () => ({
  SignaturePicker: () => null,
}));

vi.mock("@/components/compose/compose_shared", () => ({
  ComposeToolbar: ({ compose }: { compose: ComposeToolbarState }) => {
    toolbar_states.push(compose);

    return null;
  },
  ComposeFileInputSimple: () => null,
  AttachmentListSimple: () => null,
  get_aster_footer: () => "",
}));

import { ReplyBody } from "@/components/modals/reply/reply_body";
import { ForwardBody } from "@/components/modals/forward/forward_body";

const noop = () => {};

const shared_props = {
  t: (key: string) => key,
  reduce_motion: true,
  is_minimized: false,
  message_editor_ref: { current: null },
  message_content: "",
  editor: {
    handle_input: noop,
    handle_drag_over: noop,
    handle_drop: noop,
    handle_paste: noop,
    insert_html: noop,
    is_mac: false,
  },
  can_send: false,
  scheduled_time: null,
  handle_scheduled_send: noop,
  handle_send: noop,
  handle_forward: noop,
  original_body: "<p>original quoted message</p>",
  forward_content_ref: { current: "<p>forwarded</p>" },
  is_forward_visible: true,
  recipients_count: 1,
  on_discard: noop,
  show_quoted: false,
  set_show_quoted: noop,
  include_quoted: true,
  set_include_quoted: noop,
  build_quoted_content: () => "<blockquote>quoted</blockquote>",
  attachments: [],
  attachments_scroll_ref: { current: null },
  remove_attachment: noop,
  trigger_file_select: noop,
  error_message: null,
  set_error_message: noop,
  attachment_error: null,
  set_attachment_error: noop,
  file_input_ref: { current: null },
  handle_file_select: noop,
  is_scheduling: false,
  is_sending: false,
  is_valid: false,
  set_scheduled_time: noop,
  expires_at: null,
  set_expires_at: noop,
  expiry_password: null,
  set_expiry_password: noop,
  active_formats: new Set<string>(),
  exec_format_command: noop,
  handle_insert_link: noop,
  draft_status: "idle",
  last_saved_time: null,
  draft_id: null,
  set_show_delete_confirm: noop,
  show_delete_confirm: false,
  handle_delete_draft: noop,
  is_plain_text_mode: false,
  toggle_plain_text_mode: noop,
  handle_template_select: noop,
  is_mac: false,
};

type ReplyProps = React.ComponentProps<typeof ReplyBody>;
type ForwardProps = React.ComponentProps<typeof ForwardBody>;

function reply_props(overrides: Record<string, unknown> = {}): ReplyProps {
  return { ...shared_props, ...overrides } as unknown as ReplyProps;
}

function forward_props(overrides: Record<string, unknown> = {}): ForwardProps {
  return { ...shared_props, ...overrides } as unknown as ForwardProps;
}

describe("reply and forward send pending state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    toolbar_states.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("forwards the reply pending state to the send toolbar", () => {
    act(() => {
      root.render(<ReplyBody {...reply_props({ is_sending: true })} />);
    });

    expect(toolbar_states.at(-1)?.is_sending).toBe(true);
    expect(toolbar_states.at(-1)?.has_recipients).toBe(true);
  });

  it("clears the reply pending state when the request settles", () => {
    act(() => {
      root.render(<ReplyBody {...reply_props({ is_sending: false })} />);
    });

    expect(toolbar_states.at(-1)?.is_sending).toBe(false);
  });

  it("forwards the forward pending state to the send toolbar", () => {
    act(() => {
      root.render(<ForwardBody {...forward_props({ is_sending: true })} />);
    });

    expect(toolbar_states.at(-1)?.is_sending).toBe(true);
  });

  it("clears the forward pending state when the request settles", () => {
    act(() => {
      root.render(<ForwardBody {...forward_props({ is_sending: false })} />);
    });

    expect(toolbar_states.at(-1)?.is_sending).toBe(false);
  });
});
