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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke_mock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

import { print_current_page, request_print } from "./print_page";
import { print_email, print_thread } from "./print_email";
import { print_contacts } from "./contact_print";

import { print_recovery_codes } from "@/services/crypto/recovery_pdf";
import type { DecryptedContact } from "@/types/contacts";

const t = ((key: string) => key) as Parameters<typeof print_email>[1];

const email = {
  subject: "Quarterly report",
  sender: "Ada",
  sender_email: "ada@example.com",
  to: [{ email: "grace@example.com" }],
  timestamp: "Mon",
  body: "<p>Hello</p>",
};

const contact_labels = {
  title: "Contacts",
  email: "Email",
  phone: "Phone",
  company: "Company",
  job_title: "Job title",
  address: "Address",
  birthday: "Birthday",
  notes: "Notes",
};

const contact = {
  id: "c1",
  first_name: "Grace",
  last_name: "Hopper",
  emails: ["grace@example.com"],
} as unknown as DecryptedContact;

let print_spy: ReturnType<typeof vi.fn>;
let platform_spy: { mockRestore: () => void } | null = null;
let root_at_print: string | null = null;

function mark_desktop_shell(platform: string): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
  platform_spy = vi
    .spyOn(window.navigator, "platform", "get")
    .mockReturnValue(platform);
}

function print_root(): HTMLElement | null {
  return document.getElementById("aster-print-root");
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke_mock.mockReset();
  invoke_mock.mockResolvedValue(undefined);
  root_at_print = null;
  print_spy = vi.fn(() => {
    root_at_print = print_root()?.textContent ?? null;
  });
  Object.defineProperty(window, "print", {
    value: print_spy,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  window.dispatchEvent(new Event("afterprint"));
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  platform_spy?.mockRestore();
  platform_spy = null;
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();
});

describe("printing from a click", () => {
  it("opens the print dialog for an email before the click handler returns", () => {
    print_email(email, t);

    expect(print_spy).toHaveBeenCalledTimes(1);
    expect(root_at_print).toContain("Quarterly report");
    expect(root_at_print).toContain("Hello");
  });

  it("opens the print dialog for a thread before the click handler returns", () => {
    print_thread(
      {
        subject: "Thread subject",
        messages: [
          {
            sender: "Ada",
            sender_email: "ada@example.com",
            timestamp: "Mon",
            body: "<p>First</p>",
          },
        ],
      },
      t,
    );

    expect(print_spy).toHaveBeenCalledTimes(1);
    expect(root_at_print).toContain("Thread subject");
    expect(root_at_print).toContain("First");
  });

  it("keeps the printout until printing ends, then removes it", () => {
    print_email(email, t);

    expect(print_root()).not.toBeNull();
    expect(document.getElementById("aster-print-styles")).not.toBeNull();

    window.dispatchEvent(new Event("afterprint"));

    expect(print_root()).toBeNull();
    expect(document.getElementById("aster-print-styles")).toBeNull();
  });

  it("removes the printout if printing never reports that it ended", () => {
    print_email(email, t);
    vi.advanceTimersByTime(60000);

    expect(print_root()).toBeNull();
  });

  it("releases a leftover menu pointer lock after printing", () => {
    document.body.style.pointerEvents = "none";
    print_email(email, t);
    window.dispatchEvent(new Event("afterprint"));
    vi.advanceTimersByTime(0);

    expect(document.body.style.pointerEvents).toBe("");
  });

  it("prints contacts in the page instead of a frame", () => {
    print_contacts([contact], contact_labels);

    expect(print_spy).toHaveBeenCalledTimes(1);
    expect(root_at_print).toContain("Grace Hopper");
    expect(document.querySelector("iframe")).toBeNull();

    window.dispatchEvent(new Event("afterprint"));

    expect(print_root()).toBeNull();
    expect(document.title).not.toBe("Contacts");
  });

  it("prints recovery codes in the page and removes them afterward", () => {
    print_recovery_codes("ada@example.com", ["AAAA-BBBB", "CCCC-DDDD"], t);

    expect(print_spy).toHaveBeenCalledTimes(1);
    expect(root_at_print).toContain("AAAA-BBBB");
    expect(document.querySelector("iframe")).toBeNull();

    window.dispatchEvent(new Event("afterprint"));

    expect(print_root()).toBeNull();
    expect(document.body.textContent).not.toContain("AAAA-BBBB");
  });
});

describe("desktop app printing", () => {
  it("asks the Mac app to print natively, keeping the printout in place", async () => {
    mark_desktop_shell("MacIntel");
    print_email(email, t);

    await vi.waitFor(() =>
      expect(invoke_mock).toHaveBeenCalledWith("print_webview"),
    );
    expect(print_spy).not.toHaveBeenCalled();
    expect(print_root()).not.toBeNull();
  });

  it("prints the recovery page natively in the Mac app", async () => {
    mark_desktop_shell("MacIntel");
    print_current_page();

    await vi.waitFor(() =>
      expect(invoke_mock).toHaveBeenCalledWith("print_webview"),
    );
    expect(print_spy).not.toHaveBeenCalled();
  });

  it("falls back to the page print when the native call fails", async () => {
    mark_desktop_shell("MacIntel");
    invoke_mock.mockRejectedValue(new Error("unavailable"));
    request_print();

    await vi.waitFor(() => expect(print_spy).toHaveBeenCalledTimes(1));
  });

  it("uses the page print in the Windows app", () => {
    mark_desktop_shell("Win32");
    print_email(email, t);

    expect(print_spy).toHaveBeenCalledTimes(1);
    expect(invoke_mock).not.toHaveBeenCalled();
  });
});
