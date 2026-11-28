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

const h = vi.hoisted(() => ({
  pq_deleted: [] as number[],
  ec_deleted: [] as number[],
}));

vi.mock("./pq_prekey_store", () => ({
  consume_pq_prekey: async (key_id: number) => {
    h.pq_deleted.push(key_id);
  },
}));

vi.mock("./ec_prekey_store", () => ({
  delete_ec_one_time_secret: async (key_id: number) => {
    h.ec_deleted.push(key_id);
  },
}));

import { discard_used_one_time_prekey } from "./ratchet_decrypt";
import { PQ_IDENTITY_KEY_ID } from "./x3dh";
import type { RatchetRecipientData } from "./ratchet_types";

function recipient(fields: Partial<RatchetRecipientData>): RatchetRecipientData {
  return fields as RatchetRecipientData;
}

const pq_session_start = { pq_ciphertext: "AAAA", ephemeral_key: "AAAA" };

describe("discard_used_one_time_prekey", () => {
  beforeEach(() => {
    h.pq_deleted.length = 0;
    h.ec_deleted.length = 0;
  });

  it("deletes the post-quantum one-time secret once a session is adopted", async () => {
    await discard_used_one_time_prekey(
      recipient({ ...pq_session_start, pq_key_id: 41 }),
    );

    expect(h.pq_deleted).toEqual([41]);
  });

  it("keeps the post-quantum identity secret", async () => {
    await discard_used_one_time_prekey(
      recipient({ ...pq_session_start, pq_key_id: PQ_IDENTITY_KEY_ID }),
    );

    expect(h.pq_deleted).toEqual([]);
  });

  it("does nothing when the session start named no post-quantum key", async () => {
    await discard_used_one_time_prekey(recipient({}));

    expect(h.pq_deleted).toEqual([]);
    expect(h.ec_deleted).toEqual([]);
  });
});
