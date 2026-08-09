import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";

import * as openpgp from "openpgp";

const [, , step, dir, curve_arg] = argv;

if (!step || !dir) {
  console.error("usage: pgp_interop_external.mjs <generate|verify> <dir> [curve|rsa]");
  exit(2);
}

const EXPECTED_SUBJECT = "Interop check: protected headers";
const EXPECTED_BODY_FRAGMENT = "Encrypted for an external OpenPGP user.";
const REPLY_PLAINTEXT = "Reply from an external OpenPGP client.";

async function generate() {
  const config =
    curve_arg === "rsa"
      ? { type: "rsa", rsaBits: 3072 }
      : { type: "ecc", curve: "curve25519" };

  const { privateKey, publicKey } = await openpgp.generateKey({
    ...config,
    userIDs: [{ name: "External User", email: "external@example.com" }],
    format: "armored",
  });

  await writeFile(join(dir, "external_public.asc"), publicKey);
  await writeFile(join(dir, "external_secret.asc"), privateKey);

  console.log(`generated ${curve_arg === "rsa" ? "rsa-3072" : "curve25519"} external key`);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  exit(1);
}

function decode_base64_parts(mime) {
  const parts = [];

  for (const line of mime.split(/\r?\n/)) {
    const candidate = line.trim();

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(candidate) || candidate.length < 8) continue;

    try {
      parts.push(Buffer.from(candidate, "base64").toString("utf8"));
    } catch {
      continue;
    }
  }

  return parts;
}

async function verify() {
  const armored_secret = await readFile(join(dir, "external_secret.asc"), "utf8");
  const armored_ciphertext = await readFile(join(dir, "to_external.asc"), "utf8");

  const private_key = await openpgp.readPrivateKey({ armoredKey: armored_secret });
  const message = await openpgp.readMessage({ armoredMessage: armored_ciphertext });

  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: private_key,
    format: "utf8",
  });

  if (!data.includes(EXPECTED_SUBJECT)) {
    fail("decrypted message does not carry the protected Subject header");
  }

  const decoded_parts = decode_base64_parts(data);

  if (!decoded_parts.some((part) => part.includes(EXPECTED_BODY_FRAGMENT))) {
    fail("decrypted message does not carry the body");
  }

  if (!decoded_parts.some((part) => part.includes(`<p>${EXPECTED_BODY_FRAGMENT}</p>`))) {
    fail("decrypted message does not carry the html alternative");
  }

  if (!data.includes('protected-headers="v1"')) {
    fail("decrypted message is not a protected-headers MIME part");
  }

  if (!data.includes("To: external@example.com")) {
    fail("decrypted message does not carry the protected To header");
  }

  if (!data.includes("Cc: watcher@example.com")) {
    fail("decrypted message does not carry the protected Cc header");
  }

  const armored_aster_public = await readFile(join(dir, "aster_public.asc"), "utf8");
  const aster_public = await openpgp.readKey({ armoredKey: armored_aster_public });

  const reply = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: REPLY_PLAINTEXT }),
    encryptionKeys: aster_public,
    format: "armored",
  });

  await writeFile(join(dir, "from_external.asc"), reply);
  await writeFile(join(dir, "from_external_plaintext.txt"), REPLY_PLAINTEXT);

  console.log("external client decrypted the Aster message and produced a reply");
}

if (step === "generate") {
  await generate();
} else if (step === "verify") {
  await verify();
} else {
  console.error(`unknown step: ${step}`);
  exit(2);
}
