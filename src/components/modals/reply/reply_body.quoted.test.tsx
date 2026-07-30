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

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  ComposeToolbar: () => null,
  ComposeFileInputSimple: () => null,
  AttachmentListSimple: () => null,
}));

import { ReplyBody } from "@/components/modals/reply/reply_body";

type ReplyBodyProps = React.ComponentProps<typeof ReplyBody>;

const noop = () => {};

function build_props(overrides: Partial<ReplyBodyProps> = {}): ReplyBodyProps {
  return {
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
    },
    can_send: false,
    scheduled_time: null,
    handle_scheduled_send: noop,
    handle_send: noop,
    original_body: "<p>original quoted message</p>",
    show_quoted: false,
    set_show_quoted: noop,
    include_quoted: true,
    set_include_quoted: noop,
    build_quoted_content: () => "<blockquote>original quoted message</blockquote>",
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
    ...overrides,
  } as unknown as ReplyBodyProps;
}

describe("ReplyBody quoted text controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const find_button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(label),
    );

  it("shows the remove control alongside the quote toggle when quoted text is included", () => {
    act(() => {
      root.render(<ReplyBody {...build_props()} />);
    });

    expect(find_button("mail.show_quoted_text")).toBeTruthy();
    expect(find_button("mail.remove_quoted_text")).toBeTruthy();
    expect(container.textContent).not.toContain("mail.quoted_text_removed");
  });

  it("removes the quote and collapses the preview when remove is clicked", () => {
    const set_include_quoted = vi.fn();
    const set_show_quoted = vi.fn();

    act(() => {
      root.render(
        <ReplyBody
          {...build_props({ set_include_quoted, set_show_quoted, show_quoted: true })}
        />,
      );
    });

    const remove = find_button("mail.remove_quoted_text");
    expect(remove).toBeTruthy();

    act(() => {
      remove!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(set_include_quoted).toHaveBeenCalledWith(false);
    expect(set_show_quoted).toHaveBeenCalledWith(false);
  });

  it("shows the removed notice with a restore action when quoted text is excluded", () => {
    const set_include_quoted = vi.fn();

    act(() => {
      root.render(
        <ReplyBody
          {...build_props({ include_quoted: false, set_include_quoted })}
        />,
      );
    });

    expect(container.textContent).toContain("mail.quoted_text_removed");
    expect(find_button("mail.show_quoted_text")).toBeFalsy();

    const restore = find_button("mail.restore_quoted_text");
    expect(restore).toBeTruthy();

    act(() => {
      restore!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(set_include_quoted).toHaveBeenCalledWith(true);
  });

  it("shows no quote controls at all when there is no original body", () => {
    act(() => {
      root.render(<ReplyBody {...build_props({ original_body: "" })} />);
    });

    expect(find_button("mail.show_quoted_text")).toBeFalsy();
    expect(find_button("mail.remove_quoted_text")).toBeFalsy();
    expect(container.textContent).not.toContain("mail.quoted_text_removed");
  });
});
