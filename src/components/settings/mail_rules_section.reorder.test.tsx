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

const store = vi.hoisted(() => ({
  state: { rules: [] as unknown[], loading: false, loaded: true, runs: {} },
  seed: null as unknown,
  limit: 2,
}));

const reorder_mock = vi.hoisted(() => vi.fn(async (_ids: string[]) => true));

vi.mock("@/stores/mail_rules_store", () => ({
  use_mail_rules_store: () => store.state,
  load_rules: vi.fn(async () => undefined),
  load_runs: vi.fn(async () => undefined),
  stop_all_run_polls: vi.fn(),
  reorder: reorder_mock,
  take_rule_seed: () => {
    const seed = store.seed;

    store.seed = null;

    return seed;
  },
}));

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string) => key;

  return { use_i18n: () => ({ t }) };
});

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: {
      limits: { max_custom_filters: { limit: store.limit, used: 0 } },
    },
    is_loading: false,
  }),
}));

vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    state: { folders: [], is_loading: false },
    fetch_folders: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: { tags: [], is_loading: false },
    fetch_tags: vi.fn(),
  }),
}));

vi.mock("@/components/settings/search_context", () => ({
  use_register_search_items: vi.fn(),
}));

vi.mock("@/components/modals/rule_editor_modal", () => ({
  RuleEditorModal: ({
    is_open,
    seed,
  }: {
    is_open: boolean;
    seed?: { name?: string } | null;
  }) => (is_open ? <div data-testid="editor">{seed?.name ?? ""}</div> : null),
}));

vi.mock("@/components/mail_rules/template_gallery_modal", () => ({
  TemplateGalleryModal: () => null,
}));

vi.mock("@/components/settings/folder_retention_section", () => ({
  use_folder_retention: () => ({
    loading: false,
    policies: [],
    editor_open: false,
    show_upgrade: false,
    open_new: vi.fn(),
    set_editor_open: vi.fn(),
    set_show_upgrade: vi.fn(),
    get_folder_name: () => "",
  }),
  RetentionPolicyCard: () => null,
  RetentionEditorModal: () => null,
  RetentionUpgradeModal: () => null,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children: unknown }) =>
    is_open ? <div data-testid="upgrade">{children as never}</div> : null,
  ModalHeader: ({ children }: { children: unknown }) => children as never,
  ModalTitle: ({ children }: { children: unknown }) => children as never,
  ModalDescription: ({ children }: { children: unknown }) => children as never,
  ModalFooter: ({ children }: { children: unknown }) => children as never,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

import { MailRulesSection } from "@/components/settings/mail_rules_section";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function make_rule(id: string) {
  return {
    id,
    name: id,
    color: "#3b82f6",
    enabled: true,
    match_mode: "all",
    conditions: [],
    actions: [],
    applied_count: 0,
  };
}

function rule_cards(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[draggable]"));
}

function fire(el: HTMLElement, type: string) {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });
}

async function flush() {
  await act(async () => {});
}

describe("MailRulesSection drag to reorder", () => {
  beforeEach(() => {
    reorder_mock.mockClear();
    store.state = {
      rules: [make_rule("a"), make_rule("b"), make_rule("c")],
      loading: false,
      loaded: true,
      runs: {},
    };
    store.limit = -1;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<MailRulesSection />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the order when the drag is cancelled", async () => {
    const cards = rule_cards();

    expect(cards).toHaveLength(3);

    fire(cards[0], "dragstart");
    fire(cards[2], "dragover");
    fire(cards[0], "dragend");
    await flush();

    expect(reorder_mock).not.toHaveBeenCalled();
  });

  it("saves the new order once when the rule is dropped", async () => {
    const cards = rule_cards();

    fire(cards[0], "dragstart");
    fire(cards[2], "dragover");
    fire(cards[2], "drop");
    fire(cards[0], "dragend");
    await flush();

    expect(reorder_mock).toHaveBeenCalledTimes(1);
    expect(reorder_mock).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("does not reuse a cancelled drag target on the next drag", async () => {
    const cards = rule_cards();

    fire(cards[0], "dragstart");
    fire(cards[2], "dragover");
    fire(cards[0], "dragend");
    fire(cards[1], "dragstart");
    fire(cards[1], "drop");
    await flush();

    expect(reorder_mock).not.toHaveBeenCalled();
  });
});
