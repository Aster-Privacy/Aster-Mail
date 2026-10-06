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

import {
  toggle_tag_token,
  use_viewer_labels,
  type ViewerLabelsParams,
} from "./use_viewer_labels";

import { MAIL_EVENTS, emit_mail_item_updated } from "@/hooks/mail_events";

const mocks = vi.hoisted(() => ({
  add_tag_to_email: vi.fn(),
  remove_tag_from_email: vi.fn(),
  bulk_add_tag: vi.fn(),
  bulk_remove_tag: vi.fn(),
  show_toast: vi.fn(),
  show_action_toast: vi.fn(),
  tags: [
    { tag_token: "clients", name: "Clients", color: "#111111", sort_order: 0 },
    {
      tag_token: "acme",
      name: "Acme",
      color: "#222222",
      sort_order: 0,
      parent_token: "clients",
    },
    { tag_token: "taxes", name: "Taxes", color: "", sort_order: 1 },
  ],
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: { tags: mocks.tags },
    add_tag_to_email: mocks.add_tag_to_email,
    remove_tag_from_email: mocks.remove_tag_from_email,
  }),
}));

vi.mock("@/services/api/tags", () => ({
  bulk_add_tag: mocks.bulk_add_tag,
  bulk_remove_tag: mocks.bulk_remove_tag,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: mocks.show_toast,
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: mocks.show_action_toast,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_viewer_labels>;

let latest: HookResult;

function Harness(params: ViewerLabelsParams) {
  latest = use_viewer_labels(params);

  return null;
}

describe("toggle_tag_token", () => {
  it("adds a token once and removes it", () => {
    expect(toggle_tag_token([], "a", true)).toEqual(["a"]);
    expect(toggle_tag_token(["a"], "a", true)).toEqual(["a"]);
    expect(toggle_tag_token(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggle_tag_token(["b"], "a", false)).toEqual(["b"]);
  });
});

describe("use_viewer_labels", () => {
  let container: HTMLDivElement;
  let root: Root;
  let events: unknown[];
  const record_event = (event: Event) => {
    events.push((event as CustomEvent).detail);
  };

  const render = async (params: ViewerLabelsParams) => {
    await act(async () => {
      root.render(<Harness {...params} />);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.add_tag_to_email.mockResolvedValue(true);
    mocks.remove_tag_from_email.mockResolvedValue(true);
    mocks.bulk_add_tag.mockResolvedValue({ data: { affected: 2 } });
    mocks.bulk_remove_tag.mockResolvedValue({ data: { affected: 2 } });
    events = [];
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, record_event);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    window.removeEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, record_event);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("lists labels as a tree with each child under its parent", async () => {
    await render({ email_id: "m1", mail_item: { id: "m1" } });

    expect(latest.labels).toEqual([
      { tag_token: "clients", name: "Clients", color: "#111111", depth: 0 },
      { tag_token: "acme", name: "Acme", color: "#222222", depth: 1 },
      { tag_token: "taxes", name: "Taxes", color: "#6366f1", depth: 0 },
    ]);
  });

  it("offers no toggle until the message has loaded", async () => {
    await render({ email_id: "m1", mail_item: null });

    expect(latest.toggle_label).toBeUndefined();
    expect(latest.applied_tag_tokens).toEqual([]);
  });

  it("applies a label, updates the open message, and tells the list", async () => {
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: ["taxes"] },
    });

    await act(async () => {
      await latest.toggle_label?.("acme");
    });

    expect(mocks.add_tag_to_email).toHaveBeenCalledWith("m1", "acme");
    expect(latest.applied_tag_tokens).toEqual(["taxes", "acme"]);
    expect(events).toEqual([
      {
        id: "m1",
        tags: [
          { id: "taxes", name: "Taxes", color: "", icon: undefined },
          { id: "acme", name: "Acme", color: "#222222", icon: undefined },
        ],
      },
    ]);
    expect(mocks.show_action_toast).toHaveBeenCalledWith({
      message: 'common.added_label:{"label":"Acme"}',
      action_type: "folder",
      email_ids: ["m1"],
    });
  });

  it("removes a label that is already applied", async () => {
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: ["taxes", "acme"] },
    });

    await act(async () => {
      await latest.toggle_label?.("taxes");
    });

    expect(mocks.remove_tag_from_email).toHaveBeenCalledWith("m1", "taxes");
    expect(mocks.add_tag_to_email).not.toHaveBeenCalled();
    expect(latest.applied_tag_tokens).toEqual(["acme"]);
    expect(mocks.show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'common.removed_label:{"label":"Taxes"}',
      }),
    );
  });

  it("labels every message of a grouped conversation in one request", async () => {
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: [] },
      grouped_email_ids: ["m1", "m2"],
    });

    await act(async () => {
      await latest.toggle_label?.("clients");
    });

    expect(mocks.bulk_add_tag).toHaveBeenCalledWith(["m1", "m2"], "clients");
    expect(mocks.add_tag_to_email).not.toHaveBeenCalled();
    expect(latest.applied_tag_tokens).toEqual(["clients"]);
  });

  it("keeps the labels unchanged and reports the failure", async () => {
    mocks.add_tag_to_email.mockResolvedValue(false);
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: ["taxes"] },
    });

    await act(async () => {
      await latest.toggle_label?.("acme");
    });

    expect(latest.applied_tag_tokens).toEqual(["taxes"]);
    expect(events).toEqual([]);
    expect(mocks.show_action_toast).not.toHaveBeenCalled();
    expect(mocks.show_toast).toHaveBeenCalledWith(
      "common.failed_to_update",
      "error",
    );
  });

  it("follows label changes made from the message list", async () => {
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: ["taxes"] },
    });

    await act(async () => {
      emit_mail_item_updated({
        id: "other",
        tags: [{ id: "clients", name: "Clients" }],
      });
    });
    expect(latest.applied_tag_tokens).toEqual(["taxes"]);

    await act(async () => {
      emit_mail_item_updated({
        id: "m1",
        tags: [{ id: "clients", name: "Clients" }],
      });
    });
    expect(latest.applied_tag_tokens).toEqual(["clients"]);
  });

  it("drops a local change when another message opens", async () => {
    await render({
      email_id: "m1",
      mail_item: { id: "m1", tag_tokens: [] },
    });
    await act(async () => {
      await latest.toggle_label?.("acme");
    });
    expect(latest.applied_tag_tokens).toEqual(["acme"]);

    await render({
      email_id: "m2",
      mail_item: { id: "m2", tag_tokens: ["taxes"] },
    });
    expect(latest.applied_tag_tokens).toEqual(["taxes"]);
  });
});
