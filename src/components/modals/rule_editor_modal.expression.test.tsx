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

declare global {
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
  run_on_existing: vi.fn(async () => null),
  refresh_run: vi.fn(async () => null),
  cancel_run: vi.fn(async () => null),
  use_mail_rules_store: () => ({
    rules: [],
    loading: false,
    runs: {},
  }),
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

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
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
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: { value: string; onChange: (e: unknown) => void }) => (
    <input
      data-testid="rule-name"
      value={props.value}
      onChange={props.onChange}
    />
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
  AndOrPill: (p: { on_change: (m: string) => void }) => (
    <button onClick={() => p.on_change("any")}>pick-or</button>
  ),
}));
vi.mock("@/components/mail_rules/action_chip", () => ({
  ActionChip: () => null,
}));
vi.mock("@/components/mail_rules/add_action_chip", () => ({
  AddActionChip: () => null,
}));

import { RuleEditorModal } from "@/components/modals/rule_editor_modal";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  update_rule.mockClear();
  create_rule.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function find_button(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "") === label,
  );

  if (!button) throw new Error(`button not found: ${label}`);

  return button;
}

async function click(label: string) {
  await act(async () => {
    find_button(label).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
}

function expression_text(): string {
  return (container.querySelector("textarea") as HTMLTextAreaElement).value;
}

function make_rule(conditions: Rule["conditions"]): Rule {
  return {
    id: "r1",
    name: "Rule",
    color: "#6366f1",
    enabled: true,
    match_mode: "all",
    conditions,
    actions: [{ type: "star", value: true }],
    sort_order: 0,
    applied_count: 0,
    expression: null,
    created_at: "",
    updated_at: "",
  } as Rule;
}

function open_editor(rule: Rule) {
  act(() => {
    root.render(<RuleEditorModal is_open on_close={() => {}} rule={rule} />);
  });
}

interface SavedRequest {
  match_mode: string;
  conditions: Rule["conditions"];
  expression: string | null;
}

function saved_request(): SavedRequest {
  return update_rule.mock.calls[0][1] as SavedRequest;
}

function created_request(): SavedRequest {
  return create_rule.mock.calls[0][0] as SavedRequest;
}

function open_new_editor() {
  act(() => {
    root.render(
      <RuleEditorModal
        is_open
        on_close={() => {}}
        seed={{
          name: "Rule",
          color: "#6366f1",
          match_mode: "all",
          conditions: [],
          actions: [{ type: "star", value: true }],
        }}
      />,
    );
  });
}

function type_expression(text: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  const set_value = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  act(() => {
    set_value?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const MATCH_CASE_RULE = () =>
  make_rule([
    {
      type: "subject",
      operator: "contains",
      value: "URGENT",
      case_sensitive: true,
    },
  ]);

describe("rule editor expression tab", () => {
  it("keeps Match case after switching to Expression and back", async () => {
    open_editor(MATCH_CASE_RULE());
    await click("mail_rules.tab_expression");
    await click("mail_rules.tab_visual");
    await click("mail_rules.save_rule");

    expect(saved_request().conditions).toEqual([
      {
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      },
    ]);
  });

  it("keeps Match case when saving from the Expression tab", async () => {
    open_editor(MATCH_CASE_RULE());
    await click("mail_rules.tab_expression");
    await click("mail_rules.save_rule");

    expect(saved_request().conditions).toEqual([
      {
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      },
    ]);
  });

  it("keeps an and to or change made in Visual after returning to Expression", async () => {
    open_editor(
      make_rule([
        { type: "from", operator: "contains", value: "alice" },
        { type: "subject", operator: "contains", value: "invoice" },
      ]),
    );
    await click("mail_rules.tab_expression");
    await click("mail_rules.tab_visual");
    await click("pick-or");
    await click("mail_rules.tab_expression");

    expect(expression_text()).toBe(
      'from.address contains "alice" or subject contains "invoice"',
    );

    await click("mail_rules.save_rule");

    expect(saved_request().match_mode).toBe("any");
  });

  it("does not send match_case to the server when creating a rule", async () => {
    open_new_editor();
    await click("mail_rules.tab_expression");
    type_expression('subject contains "URGENT" match_case');
    await click("mail_rules.save_rule");

    expect(created_request().expression).toBeNull();
    expect(created_request().conditions).toEqual([
      {
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      },
    ]);
  });

  it("clears the stored expression when updating a case sensitive rule", async () => {
    open_editor({
      ...MATCH_CASE_RULE(),
      expression: 'subject contains "URGENT"',
    });
    await click("mail_rules.tab_expression");

    expect(expression_text()).toBe('subject contains "URGENT" match_case');

    await click("mail_rules.save_rule");

    expect(saved_request().expression).toBeNull();
  });

  it("still sends the expression for rules without Match case", async () => {
    open_new_editor();
    await click("mail_rules.tab_expression");
    type_expression('subject contains "invoice"');
    await click("mail_rules.save_rule");

    expect(created_request().expression).toBe('subject contains "invoice"');
  });

  it("opens in Visual when the stored expression no longer matches the conditions", async () => {
    open_editor({
      ...MATCH_CASE_RULE(),
      expression: 'subject contains "URGENT"',
    });

    expect(container.querySelector("textarea")).toBeNull();

    await click("mail_rules.save_rule");

    expect(saved_request().conditions).toEqual([
      {
        type: "subject",
        operator: "contains",
        value: "URGENT",
        case_sensitive: true,
      },
    ]);
  });

  it("opens a stored expression that matches the conditions in Expression", () => {
    open_editor({
      ...make_rule([
        { type: "from", operator: "contains", value: "alice" },
        { type: "subject", operator: "contains", value: "invoice" },
      ]),
      expression: 'from.address contains "alice"\n  subject contains "invoice"',
    });

    expect(expression_text()).toBe(
      'from.address contains "alice"\n  subject contains "invoice"',
    );
  });

  it("opens a stored top-level or expression as written", () => {
    open_editor({
      ...make_rule([
        {
          type: "or",
          conditions: [
            { type: "from", operator: "contains", value: "alice" },
            { type: "subject", operator: "contains", value: "invoice" },
          ],
        },
      ]),
      expression: 'from.address contains "alice" or subject contains "invoice"',
    });

    expect(expression_text()).toBe(
      'from.address contains "alice" or subject contains "invoice"',
    );
  });
});
