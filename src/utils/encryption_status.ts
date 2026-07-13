export interface E2eSignals {
  is_external: boolean;
  has_recipient_key?: boolean;
  was_pgp_encrypted?: boolean;
}

// A message is end-to-end encrypted when it is internal Aster-to-Aster mail (the server never held
// plaintext), when we encrypted it to an external recipient's discovered public key at send time
// (WKD / has_recipient_key), OR when its body was a genuine OpenPGP message that decrypted on the
// client. The first two are send-side signals; the third is the only signal for RECEIVED PGP mail
// (e.g. inbound from Proton), which the send-side flags never describe - without it, genuine E2E
// mail is under-reported as merely "encrypted in transit".
export function compute_is_e2e({
  is_external,
  has_recipient_key = false,
  was_pgp_encrypted = false,
}: E2eSignals): boolean {
  return !is_external || has_recipient_key || was_pgp_encrypted;
}
