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
import type { Rule } from "@/services/api/mail_rules";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const store = vi.hoisted(() => ({
  state: { rules: [] as unknown[], loading: false, loaded: true, runs: {} },
}));

vi.mock("@/stores/mail_rules_store", () => ({
  use_mail_rules_store: () => store.state,
  load_rules: vi.fn(async () => undefined),
  load_runs: vi.fn(async () => undefined),
  stop_all_run_polls: vi.fn(),
  reorder: vi.fn(async () => true),
  take_rule_seed: () => null,
}));

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string) => key;

  return { use_i18n: () => ({ t }) };
});

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: { limits: { max_custom_filters: { limit: 10, used: 0 } } },
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
  RuleEditorModal: () => null,
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
  Modal: () => null,
  ModalHeader: () => null,
  ModalTitle: () => null,
  ModalDescription: () => null,
  ModalFooter: () => null,
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

function make_rule(
  name: string,
  match_mode: Rule["match_mode"],
  conditions: Rule["conditions"],
): Rule {
  return {
    id: name,
    name,
    color: "#3b82f6",
    enabled: true,
    match_mode,
    conditions,
    actions: [{ type: "mark_as", state: "read" }],
    sort_order: 0,
    applied_count: 0,
    expression: null,
    created_at: "",
    updated_at: "",
  };
}

function render_rules(rules: Rule[]) {
  store.state = { rules, loading: false, loaded: true, runs: {} };
  act(() => {
    root.render(<MailRulesSection />);
  });
}

function card_text(name: string): string {
  const title = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === name,
  );
  const card = title?.closest("button");

  return card?.textContent ?? "";
}

describe("MailRulesSection rule summary", () => {
  beforeEach(() => {
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

  it("shows the conditions inside a nested any-of group", () => {
    render_rules([
      make_rule("Nested", "all", [
        { type: "from", operator: "contains", value: "a" },
        {
          type: "or",
          conditions: [
            { type: "subject", operator: "contains", value: "x" },
            { type: "subject", operator: "contains", value: "y" },
          ],
        },
      ]),
    ]);

    const text = card_text("Nested");

    expect(text).toContain(
      'from.address contains "a" and (subject contains "x" or subject contains "y")',
    );
  });

  it("shows a negated condition instead of an empty summary", () => {
    render_rules([
      make_rule("Not boss", "all", [
        {
          type: "not",
          condition: { type: "from", operator: "contains", value: "boss" },
        },
      ]),
    ]);

    const text = card_text("Not boss");

    expect(text).toContain('not from.address contains "boss"');
  });

  it("puts the full expression in a tooltip for truncated summaries", () => {
    render_rules([
      make_rule("Any", "any", [
        { type: "from", operator: "contains", value: "a" },
        {
          type: "and",
          conditions: [
            { type: "subject", operator: "contains", value: "x" },
            { type: "has_attachment", value: true },
          ],
        },
      ]),
    ]);

    const expected =
      'from.address contains "a" or subject contains "x" and has_attachment';

    expect(container.querySelector(`[title='${expected}']`)).not.toBeNull();
  });

  it("keeps flat rules as condition chips", () => {
    render_rules([
      make_rule("Flat", "all", [
        { type: "from", operator: "contains", value: "news@shop.example" },
        { type: "subject", operator: "contains", value: "sale" },
      ]),
    ]);

    const text = card_text("Flat");

    expect(text).not.toContain("from.address");
    expect(text).toContain("news@shop.example");
    expect(text).toContain("mail_rules.and_label");
  });
});
