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
import type { ExternalAccountFolder } from "@/services/api/external_accounts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/ui/color_wheel_picker", () => ({
  ColorSwatchRow: ({
    value,
    on_change,
  }: {
    value: string;
    on_change: (value: string) => void;
  }) => (
    <button
      data-testid="swatch"
      data-value={value}
      type="button"
      onClick={() => on_change("#10B981")}
    />
  ),
}));

const { LabelSection } = await import("./label_section");
const { OutgoingMailSection } = await import("./outgoing_mail_section");
const { FolderSelectionSection, get_folder_leaf_name } =
  await import("./folder_selection_section");

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

let container: HTMLDivElement;
let root: Root;

async function render(element: ReactElement) {
  await act(async () => {
    root.render(element);
  });
}

function folder(
  path: string,
  overrides: Partial<ExternalAccountFolder> = {},
): ExternalAccountFolder {
  return {
    name: path,
    path,
    delimiter: "/",
    message_count: 1200,
    unseen_count: 0,
    hasChildren: false,
    is_selectable: true,
    ...overrides,
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("get_folder_leaf_name", () => {
  it("returns the last segment of a nested path", () => {
    expect(get_folder_leaf_name("Work/Clients/Acme", "/")).toBe("Acme");
  });

  it("ignores trailing and doubled delimiters", () => {
    expect(get_folder_leaf_name("Work//Archive/", "/")).toBe("Archive");
  });

  it("decodes modified UTF-7 names", () => {
    expect(get_folder_leaf_name("Projects.&AOk-t&AOk-", ".")).toBe("été");
  });

  it("returns the whole path when there is no delimiter", () => {
    expect(get_folder_leaf_name("INBOX", "")).toBe("INBOX");
  });
});

describe("LabelSection", () => {
  const base = {
    form_label_name: "",
    set_form_label_name: vi.fn(),
    form_label_color: "#3B82F6",
    set_form_label_color: vi.fn(),
    handle_label_color_change: vi.fn(),
    handle_label_color_input: vi.fn(),
    t,
  };

  it("previews the label name in its color", async () => {
    await render(
      <LabelSection
        {...base}
        form_label_color="#EF4444"
        form_label_name="  Work  "
      />,
    );
    const preview = container.querySelector<HTMLElement>(
      '[data-testid="ext-account-label-preview"]',
    )!;

    expect(preview.textContent).toBe("Work");
    expect(
      preview.querySelector<HTMLElement>("span")!.style.backgroundColor,
    ).not.toBe("");
    expect(
      container
        .querySelector('[data-testid="swatch"]')!
        .getAttribute("data-value"),
    ).toBe("#EF4444");
  });

  it("shows the placeholder when the name is empty", async () => {
    await render(<LabelSection {...base} />);

    expect(
      container.querySelector('[data-testid="ext-account-label-preview"]')!
        .textContent,
    ).toBe("settings.label_name_placeholder");
  });

  it("falls back to a valid color while a typed value is incomplete", async () => {
    await render(<LabelSection {...base} form_label_color="#12" />);

    expect(
      container
        .querySelector('[data-testid="swatch"]')!
        .getAttribute("data-value"),
    ).toBe("#3B82F6");
  });

  it("passes swatch picks and name edits to the form", async () => {
    const on_color = vi.fn();
    const on_name = vi.fn();

    await render(
      <LabelSection
        {...base}
        handle_label_color_change={on_color}
        set_form_label_name={on_name}
      />,
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="swatch"]')!
        .click();
    });
    expect(on_color).toHaveBeenCalledWith("#10B981");

    const input = container.querySelector<HTMLInputElement>(
      "#ext-account-label-name",
    )!;

    expect(input.maxLength).toBe(100);
  });
});

describe("OutgoingMailSection", () => {
  const base = {
    editing_account: null,
    form_smtp_host: "smtp.example.com",
    form_smtp_port: 587,
    form_smtp_username: "person",
    form_smtp_password: "",
    has_stored_smtp_password: false,
    show_smtp_password: false,
    set_show_smtp_password: vi.fn(),
    form_smtp_use_tls: true,
    set_form_smtp_use_tls: vi.fn(),
    smtp_same_as_incoming: true,
    handle_smtp_host_change: vi.fn(),
    handle_smtp_port_change: vi.fn(),
    handle_smtp_username_change: vi.fn(),
    handle_smtp_password_change: vi.fn(),
    handle_smtp_same_toggle: vi.fn(),
    t,
  };

  it("hides the server fields while it reuses the incoming sign-in", async () => {
    await render(<OutgoingMailSection {...base} />);

    expect(container.querySelector("#ext-account-smtp-host")).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      1,
    );
  });

  it("turns off reuse through the switch", async () => {
    const on_toggle = vi.fn();

    await render(
      <OutgoingMailSection {...base} handle_smtp_same_toggle={on_toggle} />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>('input[type="checkbox"]')!.click();
    });

    expect(on_toggle).toHaveBeenCalledWith(false);
  });

  it("shows every server field and a TLS switch when reuse is off", async () => {
    await render(
      <OutgoingMailSection {...base} smtp_same_as_incoming={false} />,
    );

    for (const id of ["host", "port", "username", "password"]) {
      expect(container.querySelector(`#ext-account-smtp-${id}`)).not.toBeNull();
    }
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      2,
    );
    expect(
      container.querySelector<HTMLLabelElement>(
        'label[for="ext-account-smtp-host"]',
      ),
    ).not.toBeNull();
  });

  it("toggles password visibility without losing the field", async () => {
    const on_visible = vi.fn();

    await render(
      <OutgoingMailSection
        {...base}
        set_show_smtp_password={on_visible}
        smtp_same_as_incoming={false}
      />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      "button[aria-pressed]",
    )!;

    expect(toggle.getAttribute("aria-label")).toBe(
      "settings.show_smtp_password",
    );
    await act(async () => {
      toggle.click();
    });
    expect(on_visible).toHaveBeenCalledWith(true);
  });
});

describe("FolderSelectionSection", () => {
  const base = {
    available_folders: [] as ExternalAccountFolder[],
    truncated_folders: [] as ExternalAccountFolder[],
    selected_folders: [] as string[],
    is_fetching_folders: false,
    has_fetched_folders: false,
    handle_fetch_folders: vi.fn(),
    handle_folder_toggle: vi.fn(),
    t,
  };

  it("shows the empty state before folders are fetched", async () => {
    await render(<FolderSelectionSection {...base} />);

    expect(container.textContent).toContain(
      "settings.fetch_folders_instruction",
    );
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it("lists leaf names, indents children, and counts the selection", async () => {
    const folders = [
      folder("Work"),
      folder("Work/Clients", { unseen_count: 3 }),
      folder("Work/Clients/Acme"),
    ];

    await render(
      <FolderSelectionSection
        {...base}
        has_fetched_folders
        available_folders={folders}
        selected_folders={["Work/Clients"]}
        truncated_folders={folders}
      />,
    );

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-folder-row]"),
    );

    expect(
      rows.map((row) => row.getAttribute("title") ?? row.textContent),
    ).toHaveLength(3);
    expect(rows[2].textContent).toContain("Acme");
    expect(rows[2].textContent).not.toContain("Work/Clients/Acme");
    expect(
      Number.parseInt(rows[2].style.paddingInlineStart || "0", 10),
    ).toBeGreaterThan(
      Number.parseInt(rows[0].style.paddingInlineStart || "0", 10),
    );
    expect(
      container.querySelector('[data-testid="ext-folder-selected-count"]')!
        .textContent,
    ).toBe('settings.ext_v2_folders_selected:{"selected":1,"total":3}');
  });

  it("toggles a folder once from the row or its checkbox", async () => {
    const on_toggle = vi.fn();
    const folders = [folder("Archive")];

    await render(
      <FolderSelectionSection
        {...base}
        has_fetched_folders
        available_folders={folders}
        handle_folder_toggle={on_toggle}
        truncated_folders={folders}
      />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>('input[type="checkbox"]')!.click();
    });
    expect(on_toggle).toHaveBeenCalledTimes(1);
    expect(on_toggle).toHaveBeenLastCalledWith("Archive");

    await act(async () => {
      container.querySelector<HTMLElement>('[id$="-name"]')!.click();
    });
    expect(on_toggle).toHaveBeenCalledTimes(2);
    expect(on_toggle).toHaveBeenLastCalledWith("Archive");
    expect(container.querySelectorAll("label label")).toHaveLength(0);
  });

  it("disables folders the server marks as not selectable", async () => {
    const folders = [folder("[Gmail]", { is_selectable: false })];

    await render(
      <FolderSelectionSection
        {...base}
        has_fetched_folders
        available_folders={folders}
        truncated_folders={folders}
      />,
    );

    expect(
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fetches folders from the header button", async () => {
    const on_fetch = vi.fn();

    await render(
      <FolderSelectionSection {...base} handle_fetch_folders={on_fetch} />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button:not([role])")!.click();
    });

    expect(on_fetch).toHaveBeenCalledTimes(1);
  });
});
