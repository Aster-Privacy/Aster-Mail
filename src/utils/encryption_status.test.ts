import { describe, expect, it } from "vitest";

import {
  build_single_thread_message,
  process_envelope_body,
} from "@/components/email/shared/build_email_from_envelope";
import type { DecryptedEnvelope } from "@/types/email";
import { compute_is_e2e } from "@/utils/encryption_status";

const PGP_BLOCK = [
  "-----BEGIN PGP MESSAGE-----",
  "",
  "wcBMA53XuiuUllPQAQf/UjsSZ1rzjYKJxHZernS01cq8l2AyF+96LEDa8gUN",
  "=IdIe",
  "-----END PGP MESSAGE-----",
].join("\n");

function envelope_with(body: string): DecryptedEnvelope {
  return {
    from: { name: "PGP User", email: "pgpuser@proton.me" },
    to: [{ name: "", email: "me@astermail.org" }],
    cc: [],
    bcc: [],
    subject: "hi",
    body_text: body,
    body_html: body,
  } as unknown as DecryptedEnvelope;
}

describe("compute_is_e2e", () => {
  it("internal (Aster-to-Aster) mail is end-to-end encrypted", () => {
    expect(compute_is_e2e({ is_external: false })).toBe(true);
  });

  it("external plaintext with no recipient key and no PGP is NOT e2e (the reported bug case)", () => {
    expect(
      compute_is_e2e({
        is_external: true,
        has_recipient_key: false,
        was_pgp_encrypted: false,
      }),
    ).toBe(false);
  });

  it("external mail we encrypted to a discovered recipient key is e2e", () => {
    expect(
      compute_is_e2e({ is_external: true, has_recipient_key: true }),
    ).toBe(true);
  });

  it("external mail whose body was a genuine PGP message is e2e (Proton -> Aster fix)", () => {
    expect(
      compute_is_e2e({ is_external: true, was_pgp_encrypted: true }),
    ).toBe(true);
  });
});

describe("process_envelope_body PGP detection", () => {
  it("flags an inbound OpenPGP body as pgp-encrypted", async () => {
    const result = await process_envelope_body(
      envelope_with(PGP_BLOCK),
      "me@astermail.org",
      "msg-pgp",
    );
    expect(result.was_pgp_encrypted).toBe(true);
  });

  it("does not flag a plaintext body", async () => {
    const result = await process_envelope_body(
      envelope_with("just a plain newsletter, nothing encrypted"),
      "me@astermail.org",
      "msg-plain",
    );
    expect(result.was_pgp_encrypted).toBe(false);
  });
});

describe("build_single_thread_message", () => {
  it("carries was_pgp_encrypted onto the message the indicator reads", () => {
    const msg = build_single_thread_message(
      { id: "1", item_type: "received", created_at: "x", is_external: true },
      envelope_with("body"),
      "body",
      undefined,
      null,
      true,
    );
    expect(msg.was_pgp_encrypted).toBe(true);
    expect(compute_is_e2e(msg)).toBe(true);
  });
});
