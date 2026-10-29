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
import type { ActionToastConfig } from "@/components/toast/action_toast";

import { describe, it, expect, vi, beforeEach } from "vitest";

const shown: ActionToastConfig[] = [];
const simple_toasts: Array<[string, string | undefined]> = [];
const invoke = vi.fn();
let is_mac = false;

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (toast: ActionToastConfig) => shown.push(toast),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string, kind?: string) =>
    simple_toasts.push([message, kind]),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/utils", () => ({
  is_mac_platform: () => is_mac,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: async () => true,
}));

const { handle_download_finished } = await import("./desktop_download_bridge");

const VALID_ID = "3f2b6c1e-9a4d-4b7e-8c21-5d6e7f8a9b0c";

function t(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}:${JSON.stringify(params)}` : key;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("handle_download_finished", () => {
  beforeEach(() => {
    shown.length = 0;
    simple_toasts.length = 0;
    invoke.mockReset();
    is_mac = false;
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  it("shows open and show in folder actions for a safe file", () => {
    handle_download_finished(
      { id: VALID_ID, file_name: "report.pdf", can_open: true },
      t as never,
    );

    expect(shown).toHaveLength(1);
    expect(shown[0].message).toBe(
      'common.downloaded_file:{"file_name":"report.pdf"}',
    );
    expect(shown[0].action_type).toBe("download");
    expect(shown[0].actions?.map((action) => action.label)).toEqual([
      "common.open_file",
      "common.show_in_folder",
    ]);
  });

  it("hides the open action for files that cannot be opened", () => {
    handle_download_finished(
      { id: VALID_ID, file_name: "setup.exe", can_open: false },
      t as never,
    );

    expect(shown[0].actions?.map((action) => action.label)).toEqual([
      "common.show_in_folder",
    ]);
  });

  it("names Finder on macOS", () => {
    is_mac = true;
    handle_download_finished(
      { id: VALID_ID, file_name: "photo.jpg", can_open: true },
      t as never,
    );

    expect(shown[0].actions?.[1].label).toBe("common.show_in_finder");
  });

  it("sends only the download id to the native commands", async () => {
    invoke.mockResolvedValue(undefined);
    handle_download_finished(
      { id: VALID_ID, file_name: "report.pdf", can_open: true },
      t as never,
    );

    shown[0].actions?.[0].on_press();
    shown[0].actions?.[1].on_press();
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("open_download", { id: VALID_ID });
      expect(invoke).toHaveBeenCalledWith("reveal_download", {
        id: VALID_ID,
      });
    });
    await flush();
    expect(simple_toasts).toEqual([]);
  });

  it("explains when the file is gone", async () => {
    invoke.mockRejectedValue("file not found");
    handle_download_finished(
      { id: VALID_ID, file_name: "report.pdf", can_open: true },
      t as never,
    );

    shown[0].actions?.[0].on_press();
    shown[0].actions?.[1].on_press();
    await vi.waitFor(() => expect(simple_toasts).toHaveLength(2));
    expect(simple_toasts).toEqual(
      expect.arrayContaining([
        ["common.download_open_failed", "error"],
        ["common.download_reveal_failed", "error"],
      ]),
    );
  });

  it("ignores a malformed id", () => {
    handle_download_finished(
      { id: "../../etc/passwd", file_name: "x.pdf", can_open: true },
      t as never,
    );

    expect(shown).toEqual([]);
  });

  it("uses a generic message when the name is missing", () => {
    handle_download_finished(
      { id: VALID_ID, file_name: "", can_open: true },
      t as never,
    );

    expect(shown[0].message).toBe("common.download_complete");
  });

  it("adds a system notification only when the window is in the background", async () => {
    handle_download_finished(
      { id: VALID_ID, file_name: "report.pdf", can_open: true },
      t as never,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke).not.toHaveBeenCalled();

    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    handle_download_finished(
      { id: VALID_ID, file_name: "report.pdf", can_open: true },
      t as never,
    );
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("show_mail_notification", {
        title: "common.download_complete",
        body: "report.pdf",
        emailId: null,
      }),
    );
  });
});
