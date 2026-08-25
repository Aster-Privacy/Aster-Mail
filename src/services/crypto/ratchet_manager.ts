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

export {
  RecoveryLaneUnavailableError,
  build_ratchet_envelope,
  is_post_quantum_recipient_data,
  parse_ratchet_envelope,
} from "./ratchet_types";
export {
  derive_pq_identity_from_seed,
  generate_pq_identity_keys,
  generate_ratchet_keys,
  resolve_pq_identity_secret,
} from "./ratchet_keys";
export { derive_conversation_id } from "./ratchet_conversation";
export { upload_prekey_bundle } from "./ratchet_prekey_bundle";
export {
  encrypt_for_ratchet_recipient,
  recipient_supports_post_quantum,
} from "./ratchet_encrypt";
export { decrypt_ratchet_message } from "./ratchet_decrypt";
export type { RatchetEnvelope, RatchetRecipientData } from "./ratchet_types";
