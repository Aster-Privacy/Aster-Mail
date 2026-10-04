//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ReactNode } from "react";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface MockTag {
  id: string;
  tag_token: string;
  name: string;
  sort_order: number;
  parent_token?: string;
  is_undecryptable?: boolean;
}

const mocks = vi.hoisted(() => ({
  tags: [] as {
    id: string;
    tag_token: string;
    name: string;
    sort_order: number;
    parent_token?: string;
    is_undecryptable?: boolean;
  }[],
  update_existing_tag: vi.fn(),
  delete_existing_tag: vi.fn(),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: { tags: mocks.tags },
    update_existing_tag: mocks.update_existing_tag,
    delete_existing_tag: mocks.delete_existing_tag,
  }),
}));

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

vi.mock("@/components/ui/modal", () => {
  const pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({
      is_open,
      children,
    }: {
      is_open: boolean;
      children?: ReactNode;
    }) => (is_open ? <div data-testid="modal">{children}</div> : null),
    ModalHeader: pass,
    ModalTitle: pass,
    ModalDescription: pass,
    ModalBody: pass,
    ModalFooter: pass,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/spinner", () => ({ ButtonSpinner: () => null }));

vi.mock("@/components/ui/input", () => ({ Input: () => <input /> }));

vi.mock("@/components/ui/email_tag", () => ({
  TAG_COLOR_PRESETS: [],
  tag_color_label_key: () => "common.color",
}));

vi.mock("@/components/tags/tag_icon_picker", () => ({
  TagIconPicker: () => null,
}));

import { TagManagementModal } from "@/components/tags/tag_management_modal";

function make_tag(
  name: string,
  sort_order: number,
  parent?: string,
  extra: Partial<MockTag> = {},
): MockTag {
  return {
    id: `id-${name}`,
    tag_token: `token-${name}`,
    name,
    sort_order,
    parent_token: parent ? `token-${parent}` : undefined,
    ...extra,
  };
}

describe("TagManagementModal parent picker", () => {
  let container: HTMLDivElement;
  let root: Root;

  function option(id: string): HTMLButtonElement | null {
    return container.querySelector(`[data-testid="tag-parent-option-${id}"]`);
  }

  function confirm_button(): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        !button.dataset.testid && button.textContent === "common.move_label",
    );

    if (!found) throw new Error("move button not rendered");

    return found;
  }

  async function render_move(name: string): Promise<void> {
    await act(async () => {
      root.render(
        <TagManagementModal
          action="move"
          is_open={true}
          on_close={() => {}}
          tag_color="#3b82f6"
          tag_id={`id-${name}`}
          tag_name={name}
        />,
      );
    });
  }

  async function click(element: HTMLElement | null): Promise<void> {
    if (!element) throw new Error("element not rendered");

    await act(async () => {
      element.click();
    });
  }

  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.tags = [
      make_tag("work", 0),
      make_tag("invoices", 0, "work"),
      make_tag("y2026", 0, "invoices"),
      make_tag("travel", 1),
      make_tag("unreadable", 2, undefined, { is_undecryptable: true }),
    ];
    mocks.update_existing_tag.mockImplementation(async () => true);
    container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("never offers the label itself or any of its descendants", async () => {
    await render_move("work");

    expect(option("root")).not.toBeNull();
    expect(option("id-travel")).not.toBeNull();
    expect(option("id-work")).toBeNull();
    expect(option("id-invoices")).toBeNull();
    expect(option("id-y2026")).toBeNull();
  });

  it("offers ancestors and unrelated labels for a nested label", async () => {
    await render_move("invoices");

    expect(option("id-work")).not.toBeNull();
    expect(option("id-travel")).not.toBeNull();
    expect(option("id-invoices")).toBeNull();
    expect(option("id-y2026")).toBeNull();
  });

  it("never offers an unreadable label as a parent", async () => {
    await render_move("travel");

    expect(option("id-work")).not.toBeNull();
    expect(option("id-unreadable")).toBeNull();
  });

  it("keeps the move button disabled until the parent changes", async () => {
    await render_move("invoices");

    expect(confirm_button().disabled).toBe(true);

    await click(option("id-travel"));

    expect(confirm_button().disabled).toBe(false);
  });

  it("saves the chosen parent", async () => {
    await render_move("work");
    await click(option("id-travel"));
    await click(confirm_button());

    expect(mocks.update_existing_tag).toHaveBeenCalledWith(
      "id-work",
      undefined,
      undefined,
      undefined,
      undefined,
      "token-travel",
    );
  });

  it("clears the parent when the top level is chosen", async () => {
    await render_move("y2026");
    await click(option("root"));
    await click(confirm_button());

    expect(mocks.update_existing_tag).toHaveBeenCalledWith(
      "id-y2026",
      undefined,
      undefined,
      undefined,
      undefined,
      null,
    );
  });

  it("blocks a move that would duplicate a sibling name", async () => {
    mocks.tags = [
      make_tag("work", 0),
      make_tag("invoices", 0, "work"),
      make_tag("invoices_root", 1),
    ];
    mocks.tags[2].name = "invoices";

    await render_move("invoices");
    await click(option("root"));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "common.label_already_exists",
    );
    expect(confirm_button().disabled).toBe(true);
    expect(mocks.update_existing_tag).not.toHaveBeenCalled();
  });
});
