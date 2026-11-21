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
import { beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.fn();
const sign = vi.fn();

vi.mock("../api/client", () => ({
  api_client: { get: vi.fn(), put: (...args: unknown[]) => put(...args) },
}));

vi.mock("./key_manager_pgp", () => ({
  sign_ratchet_prekey_bundle: (...args: unknown[]) => sign(...args),
}));

vi.mock("./published_signing_key", () => ({
  select_published_signing_key: async () => "owner-key",
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => undefined,
}));

vi.mock("./memory_key_store", () => ({
  get_passphrase_from_memory: () => "passphrase",
  get_vault_from_memory: () => null,
  on_keys_ready: () => () => undefined,
}));

const { upload_prekey_bundle_result } = await import("./ratchet_prekey_bundle");

const vault = {
  identity_key: "owner-key",
  ratchet_identity_public: "aWRlbnRpdHk=",
  ratchet_signed_prekey_public: "cHJla2V5",
  ratchet_pq_identity_public: "cHE=",
} as unknown as Parameters<typeof upload_prekey_bundle_result>[0];

describe("prekey bundle publish signing", () => {
  beforeEach(() => {
    put.mockReset();
    sign.mockReset();
    put.mockResolvedValue({ data: {} });
  });

  it("does not publish an unsigned bundle when the owner key cannot sign", async () => {
    sign.mockRejectedValue(new Error("key decryption failed"));

    const result = await upload_prekey_bundle_result(vault);

    expect(put).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.code).toBe("signing_failed");
  });

  it("publishes the signed binding when signing works", async () => {
    sign.mockResolvedValue("c2lnbmVk");

    const result = await upload_prekey_bundle_result(vault);

    expect(result.ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].signed_prekey_signature).toBe("c2lnbmVk");
  });
});
