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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface ModalProps {
  show: boolean;
  title: string;
  hide_dont_ask?: boolean;
  dont_ask: boolean;
  on_dont_ask_change: (value: boolean) => void;
  on_confirm: () => void;
  on_cancel: () => void;
}

const mocks = vi.hoisted(() => ({
  permanently_delete_message_ids: vi.fn(async (_ids: string[]) => true),
  emit_mail_items_removed: vi.fn(),
  toasts: [] as string[],
  modal: null as ModalProps | null,
}));

vi.mock("@/components/email/viewer_shared/trash_placement", () => ({
  permanently_delete_message_ids: mocks.permanently_delete_message_ids,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_mail_items_removed: mocks.emit_mail_items_removed,
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { message: string }) => {
    mocks.toasts.push(opts.message);
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    mocks.toasts.push(message);
  },
}));

vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: (props: ModalProps) => {
    mocks.modal = props;

    return null;
  },
}));

import {
  use_search_delete,
  type SearchDeleteResult,
} from "@/components/search/search_results_page/use_search_delete";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const bulk_delete = vi.fn(async (_emails: InboxEmail[]) => true);
const apply_flag_patch = vi.fn();
const remove_results = vi.fn();
const disable_permanent_delete_confirm = vi.fn();

let actions: SearchDeleteResult;

function Probe(props: {
  confirm_before_permanent_delete?: boolean;
  can_disable?: boolean;
}) {
  actions = use_search_delete({
    t: (key: string) => key,
    bulk_delete,
    apply_flag_patch,
    remove_results,
    confirm_before_permanent_delete: props.confirm_before_permanent_delete,
    disable_permanent_delete_confirm: props.can_disable
      ? disable_permanent_delete_confirm
      : undefined,
  });

  return actions.search_delete_dialog;
}

function email(id: string, is_trashed: boolean): InboxEmail {
  return { id, is_trashed, item_type: "received" } as unknown as InboxEmail;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(
  confirm_before_permanent_delete?: boolean,
  can_disable = false,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(Probe, { confirm_before_permanent_delete, can_disable }),
    );
  });
}

describe("deleting search results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toasts = [];
    mocks.modal = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("moves a result that is not in trash to trash", async () => {
    render();
    await act(async () => {
      await actions.delete_emails([email("a", false)]);
    });

    expect(bulk_delete).toHaveBeenCalledTimes(1);
    expect(apply_flag_patch).toHaveBeenCalledWith(["a"], { is_trashed: true });
    expect(mocks.emit_mail_items_removed).toHaveBeenCalledWith({ ids: ["a"] });
    expect(mocks.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(mocks.modal!.show).toBe(false);
  });

  it("asks before permanently deleting a trashed result", async () => {
    render();
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });

    expect(bulk_delete).not.toHaveBeenCalled();
    expect(mocks.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(mocks.modal!.show).toBe(true);
    expect(mocks.modal!.hide_dont_ask).toBe(true);
    expect(mocks.modal!.title).toBe("mail.delete_permanently_question");
  });

  it("permanently deletes a trashed result once confirmed and says so", async () => {
    render();
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });
    await act(async () => {
      mocks.modal!.on_confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.permanently_delete_message_ids).toHaveBeenCalledWith(["t1"]);
    expect(remove_results).toHaveBeenCalledWith(["t1"]);
    expect(mocks.toasts).toEqual(["common.email_permanently_deleted"]);
    expect(bulk_delete).not.toHaveBeenCalled();
    expect(apply_flag_patch).not.toHaveBeenCalled();
    expect(mocks.modal!.show).toBe(false);
  });

  it("leaves the result alone when the prompt is canceled", async () => {
    render();
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });
    act(() => {
      mocks.modal!.on_cancel();
    });

    expect(mocks.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(remove_results).not.toHaveBeenCalled();
    expect(mocks.modal!.show).toBe(false);
  });

  it("skips the prompt once the permanent delete choice is saved", async () => {
    render(false);
    await act(async () => {
      await actions.delete_emails([email("t1", true), email("t2", true)]);
    });

    expect(mocks.modal!.show).toBe(false);
    expect(mocks.permanently_delete_message_ids).toHaveBeenCalledWith([
      "t1",
      "t2",
    ]);
    expect(remove_results).toHaveBeenCalledWith(["t1", "t2"]);
    expect(mocks.toasts).toEqual(["common.emails_permanently_deleted"]);
  });

  it("splits a mixed selection between trash and permanent delete", async () => {
    render(false);
    await act(async () => {
      await actions.delete_emails([email("a", false), email("t1", true)]);
    });

    expect(bulk_delete).toHaveBeenCalledWith([email("a", false)]);
    expect(apply_flag_patch).toHaveBeenCalledWith(["a"], { is_trashed: true });
    expect(mocks.permanently_delete_message_ids).toHaveBeenCalledWith(["t1"]);
  });

  it("offers don't ask again on the permanent delete prompt", async () => {
    render(undefined, true);
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });

    expect(mocks.modal!.show).toBe(true);
    expect(mocks.modal!.hide_dont_ask).toBe(false);
    expect(mocks.modal!.dont_ask).toBe(false);
  });

  it("saves the choice when don't ask again is ticked and confirmed", async () => {
    render(undefined, true);
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });
    act(() => {
      mocks.modal!.on_dont_ask_change(true);
    });
    expect(mocks.modal!.dont_ask).toBe(true);
    await act(async () => {
      mocks.modal!.on_confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(disable_permanent_delete_confirm).toHaveBeenCalledTimes(1);
    expect(mocks.permanently_delete_message_ids).toHaveBeenCalledWith(["t1"]);
    expect(bulk_delete).not.toHaveBeenCalled();
  });

  it("keeps asking when the prompt is confirmed without ticking the box", async () => {
    render(undefined, true);
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });
    await act(async () => {
      mocks.modal!.on_confirm();
      await Promise.resolve();
    });

    expect(disable_permanent_delete_confirm).not.toHaveBeenCalled();
    expect(mocks.permanently_delete_message_ids).toHaveBeenCalledWith(["t1"]);
  });

  it("does not save the choice when the prompt is canceled", async () => {
    render(undefined, true);
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });
    act(() => {
      mocks.modal!.on_dont_ask_change(true);
    });
    act(() => {
      mocks.modal!.on_cancel();
    });
    await act(async () => {
      await actions.delete_emails([email("t2", true)]);
    });

    expect(disable_permanent_delete_confirm).not.toHaveBeenCalled();
    expect(mocks.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(mocks.modal!.dont_ask).toBe(false);
  });

  it("keeps the result and reports the failure when the delete fails", async () => {
    mocks.permanently_delete_message_ids.mockResolvedValueOnce(false);
    render(false);
    await act(async () => {
      await actions.delete_emails([email("t1", true)]);
    });

    expect(remove_results).not.toHaveBeenCalled();
    expect(mocks.toasts).toEqual(["common.failed_to_permanently_delete"]);
  });
});
