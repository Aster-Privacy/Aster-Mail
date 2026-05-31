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
  encrypt_secure_message,
  decrypt_secure_message,
  derive_auth_proof,
} from "./secure_message_crypto";

describe("secure_message_crypto", () => {
  it("round-trips subject and body with the correct password", async () => {
    const password = "correct horse battery staple";
    const encrypted = await encrypt_secure_message(password, {
      subject: "Quarterly numbers",
      body: "<p>Revenue is up 12%.</p>",
    });

    const decrypted = await decrypt_secure_message(
      password,
      encrypted.kdf_salt,
      {
        encrypted_subject: encrypted.encrypted_subject,
        encrypted_body: encrypted.encrypted_body,
        encrypted_attachments: encrypted.encrypted_attachments,
      },
    );

    expect(decrypted.subject).toBe("Quarterly numbers");
    expect(decrypted.body).toBe("<p>Revenue is up 12%.</p>");
    expect(decrypted.attachments).toHaveLength(0);
  });

  it("round-trips binary attachments and filenames", async () => {
    const password = "hunter2-with-entropy";
    const data = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    const encrypted = await encrypt_secure_message(
      password,
      { subject: "files", body: "see attached" },
      [{ filename: "secret.pdf", content_type: "application/pdf", data }],
    );

    expect(encrypted.encrypted_attachments).toHaveLength(1);
    expect(encrypted.encrypted_attachments[0].content_type).toBe(
      "application/pdf",
    );
    expect(encrypted.encrypted_attachments[0].size_bytes).toBe(8);

    const decrypted = await decrypt_secure_message(
      password,
      encrypted.kdf_salt,
      {
        encrypted_subject: encrypted.encrypted_subject,
        encrypted_body: encrypted.encrypted_body,
        encrypted_attachments: encrypted.encrypted_attachments,
      },
    );

    expect(decrypted.attachments[0].filename).toBe("secret.pdf");
    expect(Array.from(decrypted.attachments[0].data)).toEqual(Array.from(data));
  });

  it("fails to decrypt with the wrong password", async () => {
    const encrypted = await encrypt_secure_message("right-password", {
      subject: "s",
      body: "b",
    });

    await expect(
      decrypt_secure_message("wrong-password", encrypted.kdf_salt, {
        encrypted_subject: encrypted.encrypted_subject,
        encrypted_body: encrypted.encrypted_body,
        encrypted_attachments: encrypted.encrypted_attachments,
      }),
    ).rejects.toThrow();
  });

  it("derives a stable auth proof matching the encrypt output", async () => {
    const password = "shared-secret-123";
    const encrypted = await encrypt_secure_message(password, {
      subject: "s",
      body: "b",
    });

    const proof = await derive_auth_proof(password, encrypted.kdf_salt);

    expect(proof).toBe(encrypted.auth_proof);
  });

  it("produces a different auth proof for the wrong password", async () => {
    const encrypted = await encrypt_secure_message("real", {
      subject: "s",
      body: "b",
    });

    const proof = await derive_auth_proof("fake", encrypted.kdf_salt);

    expect(proof).not.toBe(encrypted.auth_proof);
  });

  it("uses unique salts and nonces across messages", async () => {
    const a = await encrypt_secure_message("pw", { subject: "x", body: "y" });
    const b = await encrypt_secure_message("pw", { subject: "x", body: "y" });

    expect(a.kdf_salt).not.toBe(b.kdf_salt);
    expect(a.encrypted_subject.nonce).not.toBe(b.encrypted_subject.nonce);
    expect(a.encrypted_subject.ciphertext).not.toBe(
      b.encrypted_subject.ciphertext,
    );
  });
});
