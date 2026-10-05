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
import { clear_contact_groups_cache } from "@/hooks/use_contact_groups";
import { clear_sidebar_aliases_cache } from "@/hooks/use_sidebar_aliases";
import { clear_referral_summary_cache } from "@/hooks/use_referral_summary";
import { reset_pending_thread_replies } from "@/hooks/pending_thread_replies";
import { reset_mail_rules_store } from "@/stores/mail_rules_store";
import { clear_twin_address_cache } from "@/components/settings/aliases/use_twin_address";
import { clear_totp_setup_cache } from "@/components/settings/security/totp_setup_cache";
import { clear_cancel_password_cache } from "@/components/settings/billing/cancel_password";
import { clear_all_pending_send_stashes } from "@/components/compose/pending_send_stash";
import { clear_pending_toast_actions } from "@/components/toast/toast_action_router";
import { clear_ratchet_verification_status } from "@/services/crypto/ratchet_verification_status";
import { clear_sender_identity_authentication_cache } from "@/services/crypto/sender_identity_authentication";
import { clear_recipient_classification_cache } from "@/services/recipient_classification";
import { reset_account_key_capabilities_cache } from "@/services/api/account_key";
import { forget_current_user } from "@/services/current_identity";
import { ignore_error } from "@/lib/ignore_error";

const ACCOUNT_MEMORY_CLEARERS: ReadonlyArray<() => void> = [
  () => clear_contact_groups_cache(),
  () => clear_sidebar_aliases_cache(),
  () => clear_referral_summary_cache(),
  () => reset_pending_thread_replies(),
  () => reset_mail_rules_store(),
  () => clear_twin_address_cache(),
  () => clear_totp_setup_cache(),
  () => clear_cancel_password_cache(),
  () => clear_all_pending_send_stashes(),
  () => clear_pending_toast_actions(),
  () => clear_ratchet_verification_status(),
  () => clear_sender_identity_authentication_cache(),
  () => clear_recipient_classification_cache(),
  () => reset_account_key_capabilities_cache(),
  () => forget_current_user(),
];

export function clear_account_memory_stores(): void {
  for (const clear of ACCOUNT_MEMORY_CLEARERS) {
    try {
      clear();
    } catch (caught) {
      ignore_error(
        "contexts/auth/account_memory_stores:clear_account_memory_stores",
        caught,
      );
    }
  }
}
