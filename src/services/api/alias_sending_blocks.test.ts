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
import { afterEach, describe, expect, it, vi } from "vitest";

const { get_mock, patch_mock } = vi.hoisted(() => ({
  get_mock: vi.fn(),
  patch_mock: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: { get: get_mock, patch: patch_mock },
}));

import {
  get_sending_blocks_snapshot,
  is_alias_sending_disabled_code,
  is_option_sending_disabled,
  load_sending_blocks,
  reset_sending_blocks,
  sending_block_change_for_option,
  subscribe_sending_blocks,
  update_sending_blocks,
} from "./alias_sending_blocks";

afterEach(() => {
  reset_sending_blocks();
  get_mock.mockReset();
  patch_mock.mockReset();
});

describe("sending_block_change_for_option", () => {
  it("maps alias and domain address options to server changes", () => {
    expect(sending_block_change_for_option("a1", true)).toEqual({
      kind: "alias",
      id: "a1",
      sending_disabled: true,
    });
    expect(sending_block_change_for_option("domain-d1", false)).toEqual({
      kind: "domain_address",
      id: "d1",
      sending_disabled: false,
    });
  });

  it("maps the primary address and ghost aliases to server changes", () => {
    expect(sending_block_change_for_option("primary", true)).toEqual({
      kind: "primary",
      sending_disabled: true,
    });
    expect(sending_block_change_for_option("ghost-g1", true)).toEqual({
      kind: "alias",
      id: "g1",
      sending_disabled: true,
    });
  });

  it("ignores senders that cannot be blocked", () => {
    expect(sending_block_change_for_option("external-e1", true)).toBeNull();
    expect(
      sending_block_change_for_option("catch-all-d1-x@example.com", true),
    ).toBeNull();
  });
});

describe("sending blocks store", () => {
  it("marks options disabled after loading from the server", async () => {
    get_mock.mockResolvedValue({
      data: { alias_ids: ["a1"], domain_address_ids: ["d1"] },
    });

    await load_sending_blocks(true);

    expect(is_option_sending_disabled("a1")).toBe(true);
    expect(is_option_sending_disabled("domain-d1")).toBe(true);
    expect(is_option_sending_disabled("a2")).toBe(false);
    expect(is_option_sending_disabled("primary")).toBe(false);
  });

  it("marks the primary address and ghost aliases disabled", async () => {
    get_mock.mockResolvedValue({
      data: { primary: true, alias_ids: ["g1"], domain_address_ids: [] },
    });

    await load_sending_blocks(true);

    expect(is_option_sending_disabled("primary")).toBe(true);
    expect(is_option_sending_disabled("ghost-g1")).toBe(true);
    expect(get_sending_blocks_snapshot().primary).toBe(true);
  });

  it("fetches again on each load so other devices' changes apply", async () => {
    get_mock
      .mockResolvedValueOnce({
        data: { primary: false, alias_ids: [], domain_address_ids: [] },
      })
      .mockResolvedValueOnce({
        data: { primary: true, alias_ids: [], domain_address_ids: [] },
      });

    await load_sending_blocks();
    expect(is_option_sending_disabled("primary")).toBe(false);
    await load_sending_blocks();
    expect(is_option_sending_disabled("primary")).toBe(true);
    expect(get_mock).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous state when loading fails", async () => {
    get_mock.mockRejectedValue(new Error("offline"));

    await load_sending_blocks(true);

    expect(get_sending_blocks_snapshot()).toEqual({
      primary: false,
      alias_ids: [],
      domain_address_ids: [],
    });
  });

  it("publishes the server response after an update", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_sending_blocks(listener);

    patch_mock.mockResolvedValue({
      data: { alias_ids: ["a1"], domain_address_ids: [] },
    });

    await update_sending_blocks([
      { kind: "alias", id: "a1", sending_disabled: true },
    ]);

    expect(patch_mock).toHaveBeenCalledWith(
      "/addresses/v1/aliases/sending-blocks",
      { changes: [{ kind: "alias", id: "a1", sending_disabled: true }] },
    );
    expect(is_option_sending_disabled("a1")).toBe(true);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("does not change state when an update fails", async () => {
    patch_mock.mockResolvedValue({ error: "failed" });

    await update_sending_blocks([
      { kind: "alias", id: "a1", sending_disabled: true },
    ]);

    expect(is_option_sending_disabled("a1")).toBe(false);
  });
});

describe("is_alias_sending_disabled_code", () => {
  it("recognizes the server error code", () => {
    expect(is_alias_sending_disabled_code("ALIAS_SENDING_DISABLED")).toBe(true);
    expect(is_alias_sending_disabled_code("FORBIDDEN")).toBe(false);
    expect(is_alias_sending_disabled_code(undefined)).toBe(false);
  });
});
