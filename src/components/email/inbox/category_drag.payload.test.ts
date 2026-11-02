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
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  EMAIL_DRAG_MIME,
  EMAIL_FOLDERS_DRAG_MIME,
  EMAIL_SCOPE_DRAG_MIME,
  EMAIL_TAGS_DRAG_MIME,
  begin_category_drag,
  end_category_drag,
  is_email_drag,
  read_email_drag,
  register_scope_drag_handler,
  run_scope_drop,
  write_email_drag,
} from "./category_drag";
import { empty_selection_snapshot } from "./selection_snapshot";

interface FakeTransfer {
  data: Map<string, string>;
  transfer: DataTransfer;
}

const make_transfer = (keep_custom_types = true): FakeTransfer => {
  const data = new Map<string, string>();
  const transfer = {
    effectAllowed: "none",
    get types() {
      return Array.from(data.keys());
    },
    setData(type: string, value: string) {
      if (!keep_custom_types && type.startsWith("application/x-")) return;
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
  };

  return { data, transfer: transfer as unknown as DataTransfer };
};

const PAYLOAD = {
  ids: ["m1", "m2"],
  folder_tokens: ["f1"],
  tag_tokens: ["t1"],
  is_scope: false,
};

afterEach(() => {
  end_category_drag();
  vi.useRealTimers();
});

describe("email drag payload", () => {
  it("writes every drag type and reads them back", () => {
    const { data, transfer } = make_transfer();

    write_email_drag(transfer, PAYLOAD);

    expect(data.get(EMAIL_DRAG_MIME)).toBe('["m1","m2"]');
    expect(data.get(EMAIL_FOLDERS_DRAG_MIME)).toBe('["f1"]');
    expect(data.get(EMAIL_TAGS_DRAG_MIME)).toBe('["t1"]');
    expect(data.has(EMAIL_SCOPE_DRAG_MIME)).toBe(false);
    expect(transfer.effectAllowed).toBe("move");
    expect(read_email_drag(transfer)).toEqual(PAYLOAD);
  });

  it("falls back to the in-page payload when the engine strips custom types", () => {
    const source = make_transfer(false);
    const target = make_transfer(false);

    write_email_drag(source.transfer, PAYLOAD);

    expect(target.transfer.types).toEqual([]);
    expect(is_email_drag(target.transfer)).toBe(true);
    expect(read_email_drag(target.transfer)).toEqual(PAYLOAD);
  });

  it("ignores foreign drags once the email drag has ended", () => {
    const source = make_transfer(false);

    write_email_drag(source.transfer, PAYLOAD);
    end_category_drag();

    expect(is_email_drag(make_transfer().transfer)).toBe(false);
    expect(read_email_drag(make_transfer().transfer)).toBeNull();
    expect(is_email_drag(null)).toBe(false);
  });

  it("rejects a malformed id list and falls back to the in-page payload", () => {
    const { data, transfer } = make_transfer();

    write_email_drag(make_transfer(false).transfer, PAYLOAD);
    data.set(EMAIL_DRAG_MIME, "{not json");

    expect(read_email_drag(transfer)).toEqual(PAYLOAD);
  });

  it("routes a stripped select-all drag to the scope handler", () => {
    const run = vi.fn();
    const unregister = register_scope_drag_handler({
      is_active: () => true,
      count: () => 2,
      selection_snapshot: () => empty_selection_snapshot,
      run,
    });

    write_email_drag(make_transfer(false).transfer, {
      ...PAYLOAD,
      is_scope: true,
    });

    expect(
      run_scope_drop(make_transfer(false).transfer, {
        kind: "category",
        category: "promotions",
      }),
    ).toBe(true);
    expect(run).toHaveBeenCalledWith({
      kind: "category",
      category: "promotions",
    });
    unregister();
  });

  it("keeps drop targets armed until the drop event finishes dispatching", () => {
    vi.useFakeTimers();
    write_email_drag(make_transfer().transfer, PAYLOAD);
    begin_category_drag();

    window.dispatchEvent(new Event("drop"));

    expect(is_email_drag(null)).toBe(true);

    vi.runAllTimers();

    expect(is_email_drag(null)).toBe(false);
  });
});
