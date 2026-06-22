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

const create_rule = vi.fn(async (_req?: unknown) => ({ id: "new-rule" }));
const update_rule = vi.fn(async (_id?: unknown, _req?: unknown) => ({
  id: "edited-rule",
}));
const delete_rule = vi.fn(async (_id?: unknown) => true);

vi.mock("@/stores/mail_rules_store", () => ({
  create_rule: (req?: unknown) => create_rule(req),
  update_rule: (id?: unknown, req?: unknown) => update_rule(id, req),
  delete_rule: (id?: unknown) => delete_rule(id),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
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

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div>{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: { value: string; onChange: (e: unknown) => void }) => (
    <input data-testid="rule-name" value={props.value} onChange={props.onChange} />
  ),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/mail_rules/condition_chip", () => ({
  ConditionChip: () => null,
}));
vi.mock("@/components/mail_rules/add_condition_chip", () => ({
  AddConditionChip: () => null,
}));
vi.mock("@/components/mail_rules/and_or_pill", () => ({
  AndOrPill: () => null,
}));
vi.mock("@/components/mail_rules/action_chip", () => ({
  ActionChip: () => null,
}));
vi.mock("@/components/mail_rules/add_action_chip", () => ({
  AddActionChip: () => null,
}));

import { RuleEditorModal } from "@/components/modals/rule_editor_modal";
import { RULE_TEMPLATES, template_to_seed } from "./rule_templates";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  create_rule.mockClear();
  update_rule.mockClear();
  delete_rule.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function save_button(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "") === "mail_rules.save_rule",
  ) as HTMLButtonElement | undefined;
}

describe("applying a template into the rule editor", () => {
  it("pre-fills the name for every template", () => {
    for (const tpl of RULE_TEMPLATES) {
      const seed = template_to_seed(tpl, "Seed name");
      act(() => {
        root.render(
          <RuleEditorModal is_open on_close={() => {}} rule={null} seed={seed} />,
        );
      });
      const input = container.querySelector(
        '[data-testid="rule-name"]',
      ) as HTMLInputElement;
      expect(input.value, tpl.id).toBe("Seed name");
    }
  });

  it("blocks save until customized exactly for needs_config templates", () => {
    for (const tpl of RULE_TEMPLATES) {
      const seed = template_to_seed(tpl, "Seed name");
      act(() => {
        root.render(
          <RuleEditorModal is_open on_close={() => {}} rule={null} seed={seed} />,
        );
      });
      const btn = save_button();
      expect(btn, tpl.id).toBeTruthy();
      expect(btn!.disabled, tpl.id).toBe(!!tpl.needs_config);
    }
  });

  it("creates the rule with the template's conditions and actions on save", async () => {
    const tpl = RULE_TEMPLATES.find((t) => t.id === "newsletters")!;
    const seed = template_to_seed(tpl, "My newsletters rule");
    const on_close = vi.fn();
    act(() => {
      root.render(
        <RuleEditorModal is_open on_close={on_close} rule={null} seed={seed} />,
      );
    });

    const btn = save_button()!;
    expect(btn.disabled).toBe(false);

    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(create_rule).toHaveBeenCalledTimes(1);
    expect(update_rule).not.toHaveBeenCalled();
    const req = create_rule.mock.calls[0][0] as unknown as {
      name: string;
      match_mode: string;
      conditions: unknown[];
      actions: unknown[];
      expression: string | null;
      enabled: boolean;
    };
    expect(req.name).toBe("My newsletters rule");
    expect(req.match_mode).toBe("all");
    expect(req.enabled).toBe(true);
    expect(req.expression).toBeNull();
    expect(req.conditions).toEqual([{ type: "has_list_id", value: true }]);
    expect(req.actions).toEqual([{ type: "categorize", category: "updates" }]);
    expect(on_close).toHaveBeenCalledTimes(1);
  });
});
