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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const list_oauth_folders = vi.fn();

vi.mock("@/services/api/external_accounts/api", () => ({
  list_oauth_folders: (token: string) => list_oauth_folders(token),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/components/ui/modal", () => {
  const pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({
      children,
      is_open,
    }: {
      children?: React.ReactNode;
      is_open: boolean;
    }) => (is_open ? <div>{children}</div> : null),
    ModalHeader: pass,
    ModalTitle: pass,
    ModalDescription: pass,
    ModalBody: pass,
    ModalFooter: pass,
  };
});

const { OAuthFolderPickerModal } = await import("./oauth_folder_picker_modal");

const listed = {
  folders: [
    { name: "Work/Clients", delimiter: "/", excluded: false },
    { name: "INBOX", delimiter: "/", excluded: false },
    { name: "Archive", delimiter: "/", excluded: false },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function render_picker(on_confirm = vi.fn(), on_cancel = vi.fn()) {
  await act(async () => {
    root.render(
      <OAuthFolderPickerModal
        account_token="token-1"
        on_cancel={on_cancel}
        on_confirm={on_confirm}
      />,
    );
  });
  await act(async () => {});

  return on_confirm;
}

function switches(): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );

  expect(found).toBeDefined();

  return found!;
}

describe("OAuthFolderPickerModal", () => {
  beforeEach(() => {
    list_oauth_folders.mockReset();
    list_oauth_folders.mockResolvedValue({ data: listed });
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

  it("lists Inbox first with only Inbox selected", async () => {
    await render_picker();

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[id^="oauth-folder-"]'),
    );

    expect(rows.map((row) => row.textContent)).toEqual([
      "INBOX",
      "Archive",
      "Work / Clients",
    ]);
    expect(switches().map((s) => s.checked)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(container.textContent).toContain(
      'settings.ext_v2_folders_selected:{"selected":1,"total":3}',
    );
  });

  it("selects and clears every folder from the header button", async () => {
    await render_picker();

    await act(async () => {
      button("common.select_all").click();
    });
    expect(
      switches()
        .slice(0, 3)
        .every((s) => s.checked),
    ).toBe(true);

    await act(async () => {
      button("common.deselect_all").click();
    });
    expect(container.textContent).toContain(
      "settings.oauth_folder_picker_none_selected",
    );
    expect(button("settings.oauth_folder_picker_start").disabled).toBe(true);
  });

  it("confirms the chosen folders in list order with the import choice", async () => {
    const on_confirm = await render_picker();

    await act(async () => {
      switches()[2].click();
    });
    await act(async () => {
      switches()[3].click();
    });
    await act(async () => {
      button("settings.oauth_folder_picker_start").click();
    });

    expect(on_confirm).toHaveBeenCalledWith({
      selected_folders: ["INBOX", "Work/Clients"],
      import_existing: true,
      listed,
    });
  });

  it("offers a retry when the folder list fails to load", async () => {
    list_oauth_folders.mockResolvedValueOnce({ error: "failed" });
    await render_picker();

    expect(container.textContent).toContain(
      "settings.oauth_folder_picker_load_failed",
    );
    expect(button("settings.oauth_folder_picker_start").disabled).toBe(true);

    await act(async () => {
      button("common.retry").click();
    });
    await act(async () => {});

    expect(list_oauth_folders).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('[id^="oauth-folder-"]')).toHaveLength(3);
  });
});
