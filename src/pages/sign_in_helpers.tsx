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
import { motion } from "framer-motion";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { use_should_reduce_motion } from "@/provider";
import { get_app_query_param } from "@/lib/hard_redirect";


export const page_variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const page_transition = {
  duration: 0.2,
  ease: "easeOut",
};

export function get_safe_next_path(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");

    if (!raw) return "/";
    const decoded = decodeURIComponent(raw);

    if (!decoded.startsWith("/")) return "/";
    if (decoded.length > 1 && (decoded[1] === "/" || decoded[1] === "\\"))
      return "/";
    if (decoded.startsWith("/sign-in") || decoded.startsWith("/register"))
      return "/";

    return decoded;
  } catch {
    return "/";
  }
}

export async function decrypt_with_prf(
  prf_output: ArrayBuffer,
  encrypted_b64: string,
  nonce_b64: string,
): Promise<string | null> {
  try {
    const key_material = await crypto.subtle.importKey(
      "raw",
      prf_output,
      "HKDF",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("aster-vault-passphrase-key-v1"),
        info: new Uint8Array(0),
      },
      key_material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const enc_bytes = Uint8Array.from(atob(encrypted_b64), (c) =>
      c.charCodeAt(0),
    );
    const nonce_bytes = Uint8Array.from(atob(nonce_b64), (c) =>
      c.charCodeAt(0),
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      key,
      enc_bytes,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export type SignInDomain = "astermail.org" | "aster.cx";

export function parse_prefill_identity(): {
  local: string;
  domain: SignInDomain | null;
} {
  const raw = get_app_query_param("u") || "";
  const at_index = raw.indexOf("@");

  if (at_index === -1) return { local: raw, domain: null };

  const domain = raw.slice(at_index + 1).toLowerCase();

  return {
    local: raw.slice(0, at_index),
    domain:
      domain === "aster.cx" || domain === "astermail.org" ? domain : null,
  };
}

export interface AlertProps {
  message: string;
  is_dark: boolean;
}

export const Alert = ({ message, is_dark }: AlertProps) => {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="w-full mt-6"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={{ duration: reduce_motion ? 0 : 0.15 }}
    >
      <p
        className="text-sm text-center"
        style={{ color: is_dark ? "#f87171" : "#dc2626" }}
      >
        {message}
      </p>
    </motion.div>
  );
};

export function from_base64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(pad);

  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function decrypt_checkout_password(
  ep: string,
  en: string,
  tk: string,
): Promise<string> {
  const transfer_key = from_base64url(tk);
  const nonce = from_base64url(en);
  const encrypted = from_base64url(ep);

  const key = await crypto.subtle.importKey(
    "raw",
    transfer_key,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted, nonce);

  return new TextDecoder().decode(decrypted);
}
