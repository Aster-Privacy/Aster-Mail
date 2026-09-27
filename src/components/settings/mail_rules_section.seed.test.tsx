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
import type { RuleEditorSeed } from "@/components/mail_rules/rule_templates";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const store = vi.hoisted(() => ({
  state: { rules: [] as unknown[], loading: false, loaded: true, runs: {} },
  seed: null as RuleEditorSeed | null,
  limit: 2,
}));

vi.mock("@/stores/mail_rules_store", () => ({
  use_mail_rules_store: () => store.state,
  load_rules: vi.fn(async () => undefined),
  load_runs: vi.fn(async () => undefined),
  stop_all_run_polls: vi.fn(),
  reorder: vi.fn(async () => true),
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
    seed?: RuleEditorSeed | null;
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

const SEED: RuleEditorSeed = {
  name: "news@shop.example",
  color: "#3b82f6",
  match_mode: "all",
  conditions: [
    { type: "from", operator: "contains", value: "news@shop.example" },
  ],
  actions: [],
};

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render_section() {
  act(() => {
    root.render(<MailRulesSection />);
  });
}

function by_test_id(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

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

describe("MailRulesSection with a rule queued from search", () => {
  beforeEach(() => {
    store.state = { rules: [], loading: false, loaded: true, runs: {} };
    store.limit = 2;
    store.seed = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the editor pre-filled with the queued search filter", () => {
    store.seed = SEED;
    render_section();

    expect(by_test_id("editor")?.textContent).toBe("news@shop.example");
    expect(by_test_id("upgrade")).toBeNull();
  });

  it("offers an upgrade instead when the plan has no rules left", () => {
    store.seed = SEED;
    store.state = {
      rules: [make_rule("a"), make_rule("b")],
      loading: false,
      loaded: true,
      runs: {},
    };
    render_section();

    expect(by_test_id("editor")).toBeNull();
    expect(by_test_id("upgrade")).not.toBeNull();
  });

  it("waits for the rule list before deciding", () => {
    store.seed = SEED;
    store.state = { rules: [], loading: false, loaded: false, runs: {} };
    render_section();

    expect(by_test_id("editor")).toBeNull();

    store.state = { rules: [], loading: false, loaded: true, runs: {} };
    render_section();

    expect(by_test_id("editor")?.textContent).toBe("news@shop.example");
  });

  it("opens nothing when no filter was queued", () => {
    render_section();

    expect(by_test_id("editor")).toBeNull();
  });
});
