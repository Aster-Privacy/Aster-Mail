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
import type { DnsRecord } from "@/services/api/domains";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { en } from "@/lib/i18n/translations/en";

function translate(key: string) {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );

  return typeof text === "string" ? text : key;
}

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: translate, language: "en" }),
}));

const show_toast = vi.fn();

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

const rotate_dkim = vi.fn();

vi.mock("@/services/api/domains", () => ({
  rotate_dkim: (...args: unknown[]) => rotate_dkim(...args),
}));

const { DnsRecordCard } = await import("./dns_record_card");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const LONG_VALUE = `v=DKIM1; k=rsa; p=${"A".repeat(392)}`;
const SHORT_VALUE = `v=DKIM1; k=rsa; p=${"B".repeat(216)}`;

function dkim_record(overrides: Partial<DnsRecord> = {}): DnsRecord {
  return {
    record_type: "TXT",
    host: "aster._domainkey",
    value: LONG_VALUE,
    purpose: "dkim",
    is_verified: false,
    caveat_key: "dkim_long_value",
    ...overrides,
  };
}

async function render(
  props: Partial<Parameters<typeof DnsRecordCard>[0]> & { record: DnsRecord },
): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<DnsRecordCard {...props} />);
  });

  return container;
}

function find_button(el: HTMLElement, text: string) {
  return Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

beforeEach(() => {
  rotate_dkim.mockReset();
  show_toast.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("DnsRecordCard long DKIM value", () => {
  it("warns about the 255-character limit and offers a shorter key", async () => {
    const el = await render({
      record: dkim_record(),
      domain_id: "d1",
      on_record_replaced: vi.fn(),
    });

    expect(el.textContent).toContain("longer than 255 characters");
    expect(find_button(el, "Use a shorter key")).toBeTruthy();
  });

  it("shows the warning without the action when it cannot replace the key", async () => {
    const el = await render({ record: dkim_record() });

    expect(el.textContent).toContain("longer than 255 characters");
    expect(find_button(el, "Use a shorter key")).toBeUndefined();
  });

  it("does not offer a shorter key for a value that already fits", async () => {
    const el = await render({
      record: dkim_record({ value: SHORT_VALUE, caveat_key: undefined }),
      domain_id: "d1",
      offer_shorter_key: true,
      on_record_replaced: vi.fn(),
    });

    expect(find_button(el, "Use a shorter key")).toBeUndefined();
  });

  it("does not offer a shorter key for other record types", async () => {
    const el = await render({
      record: dkim_record({ purpose: "spf", record_type: "TXT" }),
      domain_id: "d1",
      offer_shorter_key: true,
      on_record_replaced: vi.fn(),
    });

    expect(find_button(el, "Use a shorter key")).toBeUndefined();
  });

  it("leaves a verified record alone unless health asks for it", async () => {
    const el = await render({
      record: dkim_record({ is_verified: true, caveat_key: undefined }),
      domain_id: "d1",
      on_record_replaced: vi.fn(),
    });

    expect(find_button(el, "Use a shorter key")).toBeUndefined();
  });

  it("sends one request even when Replace key is clicked twice", async () => {
    let resolve_rotation: (value: unknown) => void = () => {};

    rotate_dkim.mockReturnValue(
      new Promise((resolve) => {
        resolve_rotation = resolve;
      }),
    );
    const on_record_replaced = vi.fn();
    const el = await render({
      record: dkim_record(),
      domain_id: "d1",
      on_record_replaced,
    });

    await act(async () => {
      find_button(el, "Use a shorter key")!.click();
    });
    const confirm = find_button(el, "Replace key")!;

    await act(async () => {
      confirm.click();
      confirm.click();
    });

    expect(rotate_dkim).toHaveBeenCalledTimes(1);

    const replacement = dkim_record({
      host: "aster2._domainkey",
      value: SHORT_VALUE,
      caveat_key: undefined,
    });

    await act(async () => {
      resolve_rotation({
        data: {
          success: true,
          selector: "aster2",
          public_key: "B".repeat(216),
          dns_record: replacement,
          key_bits: 1024,
        },
      });
    });

    expect(on_record_replaced).toHaveBeenCalledWith(replacement);
    expect(show_toast).toHaveBeenCalledWith(
      en.common.dkim_short_key_done,
      "success",
    );
  });

  it("asks the user to wait when the server rate limits the change", async () => {
    rotate_dkim.mockResolvedValue({ error: "slow down", status: 429 });
    const on_record_replaced = vi.fn();
    const el = await render({
      record: dkim_record(),
      domain_id: "d1",
      on_record_replaced,
    });

    await act(async () => {
      find_button(el, "Use a shorter key")!.click();
    });
    await act(async () => {
      find_button(el, "Replace key")!.click();
    });

    expect(on_record_replaced).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(
      en.common.dkim_short_key_wait,
      "error",
    );
  });

  it("reports a failure without replacing the record", async () => {
    rotate_dkim.mockRejectedValue(new Error("network down"));
    const on_record_replaced = vi.fn();
    const el = await render({
      record: dkim_record(),
      domain_id: "d1",
      on_record_replaced,
    });

    await act(async () => {
      find_button(el, "Use a shorter key")!.click();
    });
    await act(async () => {
      find_button(el, "Replace key")!.click();
    });

    expect(on_record_replaced).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(
      en.common.something_went_wrong,
      "error",
    );
    expect(find_button(el, "Replace key")).toBeTruthy();
  });
});
