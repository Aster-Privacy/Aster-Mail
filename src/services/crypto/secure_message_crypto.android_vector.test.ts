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
import { describe, it, expect } from "vitest";

import {
  decrypt_secure_message,
  derive_auth_proof,
} from "./secure_message_crypto";

import vector from "@/tests/fixtures/secure_message_android_vector.json";

describe("secure message sealed by the Android client", () => {
  it("opens with the password and returns every part", async () => {
    const opened = await decrypt_secure_message(
      vector.password,
      vector.kdf_salt,
      vector.bundle,
    );

    expect(opened.subject).toBe(vector.subject);
    expect(opened.body).toBe(vector.body);
    expect(opened.attachments).toHaveLength(1);
    expect(opened.attachments[0].filename).toBe(vector.attachment_filename);
    expect(btoa(String.fromCharCode(...opened.attachments[0].data))).toBe(
      vector.attachment_data,
    );
  });

  it("carries the proof the server checks", async () => {
    expect(await derive_auth_proof(vector.password, vector.kdf_salt)).toBe(
      vector.auth_proof,
    );
  });

  it("does not open with another password", async () => {
    await expect(
      decrypt_secure_message(
        `${vector.password}x`,
        vector.kdf_salt,
        vector.bundle,
      ),
    ).rejects.toThrow();
  });
});
