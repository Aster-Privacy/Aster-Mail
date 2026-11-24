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
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { Action, Rule } from "@/services/api/mail_rules";
import type { RuleEditorSeed } from "@/components/mail_rules/rule_templates";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type CreateResult = {
  folder: DecryptedFolder | null;
  error?: string;
  code?: string;
};

const hoisted = vi.hoisted(() => ({
  folders: [] as DecryptedFolder[],
  create_new_folder: vi.fn(
    async (
      _name: string,
      _color?: string,
      _parent_token?: string,
    ): Promise<CreateResult> => ({ folder: null }),
  ),
  create_rule: vi.fn(async (_req?: unknown) => ({ id: "new-rule" })),
  update_rule: vi.fn(async (_id?: unknown, _req?: unknown) => ({
    id: "edited-rule",
  })),
}));

vi.mock("@/stores/mail_rules_store", () => ({
  create_rule: (req?: unknown) => hoisted.create_rule(req),
  update_rule: (id?: unknown, req?: unknown) => hoisted.update_rule(id, req),
  delete_rule: vi.fn(async () => true),
  run_on_existing: vi.fn(async () => null),
  refresh_run: vi.fn(async () => null),
  cancel_run: vi.fn(async () => null),
  use_mail_rules_store: () => ({
    rules: [],
    loading: false,
    runs: {},
  }),
}));

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

vi.mock("@/hooks/use_folders", async (import_original) => ({
  ...(await import_original<object>()),
  use_folders: () => ({
    state: { folders: hoisted.folders, is_loading: false },
    fetch_folders: vi.fn(),
    create_new_folder: hoisted.create_new_folder,
  }),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: { tags: [], is_loading: false },
    fetch_tags: vi.fn(),
  }),
}));

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(async () => ({ aliases: [] })),
  decrypt_aliases: vi.fn(async () => []),
}));

vi.mock("@/provider", async (import_original) => ({
  ...(await import_original<object>()),
  use_should_reduce_motion: () => true,
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
vi.mock("@/components/mail_rules/add_action_chip", () => ({
  AddActionChip: () => null,
}));

import { RuleEditorModal } from "@/components/modals/rule_editor_modal";

function folder(
  token: string,
  name: string,
  overrides: Partial<DecryptedFolder> = {},
): DecryptedFolder {
  return {
    id: `id_${token}`,
    folder_token: token,
    name,
    is_system: false,
    is_locked: false,
    folder_type: "custom",
    is_password_protected: false,
    password_set: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const CONDITIONS: Rule["conditions"] = [
  { type: "subject", operator: "contains", value: "invoice" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  hoisted.folders = [
    folder("inbox_tok", "Inbox", { folder_type: "inbox", is_system: true }),
    folder("work", "Work"),
    folder("personal", "Personal", { sort_order: 1 }),
  ];
  hoisted.create_new_folder.mockReset();
  hoisted.create_rule.mockClear();
  hoisted.update_rule.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function render_new(on_close = vi.fn()) {
  const seed: RuleEditorSeed = {
    name: "Invoices rule",
    color: "#6366f1",
    match_mode: "all",
    conditions: CONDITIONS,
    actions: [
      { type: "move_to", folder_token: null },
      { type: "star", value: true },
    ],
  };

  act(() => {
    root.render(<RuleEditorModal is_open on_close={on_close} seed={seed} />);
  });

  return on_close;
}

function render_existing(actions: Action[]) {
  const rule = {
    id: "r1",
    name: "Existing rule",
    color: "#6366f1",
    enabled: true,
    match_mode: "all",
    conditions: CONDITIONS,
    actions,
    sort_order: 0,
    applied_count: 0,
    expression: null,
    created_at: "",
    updated_at: "",
  } as Rule;

  act(() => {
    root.render(<RuleEditorModal is_open on_close={vi.fn()} rule={rule} />);
  });
}

function target_triggers(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[data-chip-segment]"),
  ).filter((b) => !(b.textContent ?? "").includes("mail_rules.action_move_to"));
}

function trigger_with_text(text: string): HTMLButtonElement {
  const match = target_triggers().find((b) => b.textContent?.trim() === text);

  if (!match) throw new Error(`picker trigger not found: ${text}`);

  return match;
}

function open_picker(trigger: HTMLButtonElement) {
  act(() => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function menu_items(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
}

function select_menu_item(item: HTMLElement) {
  act(() => {
    item.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function choose_create_folder() {
  const item = document.querySelector<HTMLElement>(
    '[data-testid="rule_create_folder"]',
  );

  if (!item) throw new Error("create folder item not found");
  select_menu_item(item);
}

function folder_name_input(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("input#create-folder-name");
}

function type_folder_name(value: string) {
  const input = folder_name_input();

  if (!input) throw new Error("folder name input not found");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function dialog_button(text: string): HTMLButtonElement {
  const dialog = folder_name_input()?.closest(".relative.w-full.max-w-md");
  const match = Array.from(
    dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((b) => b.textContent?.trim() === text);

  if (!match) throw new Error(`dialog button not found: ${text}`);

  return match;
}

function dialog_create_button(): HTMLButtonElement {
  return dialog_button("common.create_folder");
}

function dialog_cancel_button(): HTMLButtonElement {
  return dialog_button("common.cancel");
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function save_button(): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === "mail_rules.save_rule",
  );

  if (!match) throw new Error("save button not found");

  return match;
}

function rule_name_value(): string {
  const input = document.querySelector<HTMLInputElement>(
    'input[placeholder="mail_rules.rule_name_placeholder"]',
  );

  return input?.value ?? "";
}

interface SavedRule {
  name: string;
  conditions: unknown;
  actions: Action[];
}

describe("creating a folder from the rule move-to picker", () => {
  it("offers Create folder in the move-to picker", () => {
    render_new();
    open_picker(trigger_with_text("mail_rules.none"));

    const labels = menu_items().map((item) => item.textContent?.trim());

    expect(labels).toContain("common.create_folder");
    expect(labels).toContain("Work");
  });

  it("selects the new folder and keeps the rest of the draft", async () => {
    hoisted.create_new_folder.mockImplementation(async (name: string) => ({
      folder: folder("receipts_tok", name),
    }));
    const on_close = render_new();

    open_picker(trigger_with_text("mail_rules.none"));
    choose_create_folder();
    await flush();

    expect(folder_name_input()).not.toBeNull();

    type_folder_name("Receipts");
    await click(dialog_create_button());
    await flush();

    expect(hoisted.create_new_folder).toHaveBeenCalledTimes(1);
    const [name, , parent_token] = hoisted.create_new_folder.mock.calls[0];

    expect(name).toBe("Receipts");
    expect(parent_token).toBeUndefined();
    expect(folder_name_input()).toBeNull();
    expect(on_close).not.toHaveBeenCalled();
    expect(trigger_with_text("Receipts")).toBeTruthy();
    expect(rule_name_value()).toBe("Invoices rule");
    expect(document.activeElement).toBe(trigger_with_text("Receipts"));

    open_picker(trigger_with_text("Receipts"));
    const listed = menu_items().find(
      (item) => item.textContent?.trim() === "Receipts",
    );

    expect(listed).toBeTruthy();
    expect(listed!.querySelector("svg")).not.toBeNull();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flush();

    expect(save_button().disabled).toBe(false);
    await click(save_button());

    expect(hoisted.create_rule).toHaveBeenCalledTimes(1);
    const saved = hoisted.create_rule.mock.calls[0][0] as SavedRule;

    expect(saved.name).toBe("Invoices rule");
    expect(saved.conditions).toEqual(CONDITIONS);
    expect(saved.actions).toEqual([
      { type: "move_to", folder_token: "receipts_tok" },
      { type: "star", value: true },
    ]);
  });

  it("creates the folder under a chosen parent", async () => {
    hoisted.create_new_folder.mockImplementation(
      async (name: string, _color?: string, parent?: string) => ({
        folder: folder("child_tok", name, { parent_token: parent }),
      }),
    );
    render_new();

    open_picker(trigger_with_text("mail_rules.none"));
    choose_create_folder();
    await flush();

    const parent_trigger = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.includes("common.top_level_no_parent"));

    if (!parent_trigger) throw new Error("parent picker not found");
    act(() => {
      parent_trigger.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      parent_trigger.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      parent_trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const work = menu_items().find(
      (item) => item.textContent?.trim() === "Work",
    );

    if (!work) throw new Error("parent option not found");
    select_menu_item(work);

    type_folder_name("Clients");
    await click(dialog_create_button());
    await flush();

    expect(hoisted.create_new_folder.mock.calls[0][2]).toBe("work");
    expect(trigger_with_text("Clients")).toBeTruthy();
  });

  it("keeps the dialog and editor open at the plan folder limit", async () => {
    hoisted.create_new_folder.mockResolvedValue({
      folder: null,
      code: "PLAN_LIMIT_EXCEEDED",
    });
    const on_close = render_new();

    open_picker(trigger_with_text("mail_rules.none"));
    choose_create_folder();
    await flush();
    type_folder_name("Receipts");
    await click(dialog_create_button());
    await flush();

    expect(document.body.textContent).toContain(
      "common.folder_plan_limit_reached",
    );
    expect(folder_name_input()).not.toBeNull();
    expect(on_close).not.toHaveBeenCalled();
    expect(trigger_with_text("mail_rules.none")).toBeTruthy();
    expect(rule_name_value()).toBe("Invoices rule");
    expect(save_button().disabled).toBe(true);
  });

  it("shows an error and selects nothing when creation fails", async () => {
    hoisted.create_new_folder.mockResolvedValue({
      folder: null,
      error: "offline",
      code: "NETWORK_ERROR",
    });
    render_new();

    open_picker(trigger_with_text("mail_rules.none"));
    choose_create_folder();
    await flush();
    type_folder_name("Receipts");
    await click(dialog_create_button());
    await flush();

    expect(document.body.textContent).toContain(
      "common.failed_to_create_folder_error",
    );
    expect(folder_name_input()).not.toBeNull();

    await click(dialog_cancel_button());
    await flush();

    expect(folder_name_input()).toBeNull();
    expect(trigger_with_text("mail_rules.none")).toBeTruthy();
    expect(rule_name_value()).toBe("Invoices rule");
    expect(hoisted.create_rule).not.toHaveBeenCalled();
  });

  it("blocks empty, blank, and duplicate names without calling the server", async () => {
    render_new();

    open_picker(trigger_with_text("mail_rules.none"));
    choose_create_folder();
    await flush();

    expect(dialog_create_button().disabled).toBe(true);

    type_folder_name("   ");
    expect(dialog_create_button().disabled).toBe(true);

    type_folder_name("work");
    expect(document.body.textContent).toContain("common.folder_already_exists");
    expect(dialog_create_button().disabled).toBe(true);

    await click(dialog_create_button());
    expect(hoisted.create_new_folder).not.toHaveBeenCalled();
  });

  it("cancels without changing the action and returns focus to the picker", async () => {
    render_new();

    const trigger = trigger_with_text("mail_rules.none");

    open_picker(trigger);
    choose_create_folder();
    await flush();
    type_folder_name("Receipts");
    await click(dialog_cancel_button());
    await flush();

    expect(folder_name_input()).toBeNull();
    expect(hoisted.create_new_folder).not.toHaveBeenCalled();
    expect(trigger_with_text("mail_rules.none")).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
    expect(rule_name_value()).toBe("Invoices rule");
  });

  it("closes only the folder dialog on Escape", async () => {
    const on_close = render_new();

    const trigger = trigger_with_text("mail_rules.none");

    open_picker(trigger);
    choose_create_folder();
    await flush();
    expect(folder_name_input()).not.toBeNull();

    act(() => {
      folder_name_input()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flush();

    expect(folder_name_input()).toBeNull();
    expect(on_close).not.toHaveBeenCalled();
    expect(rule_name_value()).toBe("Invoices rule");
    expect(document.activeElement).toBe(trigger);
  });

  it("sets the new folder only on the move-to action that opened the picker", async () => {
    hoisted.create_new_folder.mockImplementation(async (name: string) => ({
      folder: folder("receipts_tok", name),
    }));
    render_existing([
      { type: "move_to", folder_token: "work" },
      { type: "move_to", folder_token: "personal" },
    ]);

    open_picker(trigger_with_text("Personal"));
    choose_create_folder();
    await flush();
    type_folder_name("Receipts");
    await click(dialog_create_button());
    await flush();

    expect(trigger_with_text("Work")).toBeTruthy();
    expect(trigger_with_text("Receipts")).toBeTruthy();
    expect(() => trigger_with_text("Personal")).toThrow();

    await click(save_button());

    expect(hoisted.update_rule).toHaveBeenCalledTimes(1);
    const saved = hoisted.update_rule.mock.calls[0][1] as SavedRule;

    expect(saved.name).toBe("Existing rule");
    expect(saved.conditions).toEqual(CONDITIONS);
    expect(saved.actions).toEqual([
      { type: "move_to", folder_token: "work" },
      { type: "move_to", folder_token: "receipts_tok" },
    ]);
  });
});
