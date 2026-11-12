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
import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  lockdown: false,
}));

vi.mock("./client", () => ({
  api_client: { get: h.get, post: h.post },
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => h.lockdown,
}));

import {
  clear_external_key_cache,
  discover_contact_key,
  discover_contact_keys_batch,
  get_key_source_label_key,
} from "./keys";

let armored_public_key = "";
let expected_fingerprint = "";

function external_result(email: string) {
  return {
    email,
    found: false,
    public_key: null,
    fingerprint: null,
    source: null,
    expires_at: null,
    will_encrypt: false,
  };
}

describe("contact key discovery", () => {
  beforeAll(async () => {
    const { publicKey } = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ email: "someone@astermail.org" }],
      format: "armored",
    });

    armored_public_key = publicKey;
    expected_fingerprint = (await openpgp.readKey({ armoredKey: publicKey }))
      .getFingerprint()
      .toUpperCase();
  });

  beforeEach(() => {
    clear_external_key_cache();
    h.get.mockReset();
    h.post.mockReset();
    h.lockdown = false;
  });

  it("returns the Aster key for an internal address", async () => {
    h.get.mockResolvedValue({
      data: { username: "someone", public_key: armored_public_key },
    });

    const response = await discover_contact_key("Someone@astermail.org");

    expect(h.get).toHaveBeenCalledWith(
      "/crypto/v1/keys/public/someone?email=someone%40astermail.org",
    );
    expect(h.post).not.toHaveBeenCalled();
    expect(response.data?.found).toBe(true);
    expect(response.data?.fingerprint).toBe(expected_fingerprint);
    expect(get_key_source_label_key(response.data?.source ?? null)).toBe(
      "settings.key_source_aster",
    );
  });

  it("falls back to external discovery when no Aster key exists", async () => {
    h.get.mockResolvedValue({ error: "not found", status: 404 });
    h.post.mockResolvedValue({ data: external_result("nobody@astermail.org") });

    const response = await discover_contact_key("nobody@astermail.org");

    expect(h.post).toHaveBeenCalledWith("/crypto/v1/keys/external/discover", {
      email: "nobody@astermail.org",
    });
    expect(response.data?.found).toBe(false);
  });

  it("never queries the Aster directory for external addresses", async () => {
    h.post.mockResolvedValue({
      data: { keys: [external_result("person@example.com")] },
    });

    const response = await discover_contact_keys_batch(["person@example.com"]);

    expect(h.get).not.toHaveBeenCalled();
    expect(response.data).toHaveLength(1);
  });

  it("merges Aster keys with external results and caches them", async () => {
    h.get.mockResolvedValue({
      data: { username: "someone", public_key: armored_public_key },
    });
    h.post.mockResolvedValue({
      data: { keys: [external_result("person@example.com")] },
    });

    const emails = ["someone@astermail.org", "person@example.com"];
    const first = await discover_contact_keys_batch(emails);

    expect(first.data?.map((key) => key.source)).toEqual(["aster", null]);
    expect(h.post).toHaveBeenCalledWith(
      "/crypto/v1/keys/external/discover/batch",
      { emails: ["person@example.com"] },
    );

    await discover_contact_keys_batch(emails);

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("sends no lookup for a single contact in lockdown mode", async () => {
    h.lockdown = true;

    const internal = await discover_contact_key("Someone@astermail.org");
    const external = await discover_contact_key("person@example.com");

    expect(h.get).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
    expect(internal.data).toMatchObject({
      email: "someone@astermail.org",
      found: false,
      public_key: null,
    });
    expect(external.data?.found).toBe(false);
  });

  it("sends no lookup for a contact's addresses in lockdown mode", async () => {
    h.lockdown = true;

    const response = await discover_contact_keys_batch([
      "someone@astermail.org",
      "person@example.com",
    ]);

    expect(h.get).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
    expect(response.data?.map((key) => key.found)).toEqual([false, false]);
  });

  it("looks keys up again after lockdown mode is turned off", async () => {
    h.lockdown = true;
    await discover_contact_keys_batch(["person@example.com"]);
    h.lockdown = false;
    h.post.mockResolvedValue({
      data: { keys: [external_result("person@example.com")] },
    });

    await discover_contact_keys_batch(["person@example.com"]);

    expect(h.post).toHaveBeenCalledTimes(1);
  });
});
