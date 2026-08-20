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
import type { } from "@/lib/i18n/types";




export interface EmailAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  is_enabled: boolean;
  is_random: boolean;
  is_pinned?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  delivery_label_token?: string | null;
  orphaned_by_key_rotation?: boolean;
  profile_picture?: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  downgrade_grace_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedEmailAlias {
  id: string;
  local_part: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  alias_address_hash: string;
  domain: string;
  full_address: string;
  is_enabled: boolean;
  is_random: boolean;
  is_pinned?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  delivery_label_token?: string | null;
  decryption_failed?: boolean;
  orphaned_by_key_rotation?: boolean;
  profile_picture?: string;
  downgrade_grace_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AliasListResponse {
  aliases: EmailAlias[];
  total: number;
  has_more: boolean;
  max_aliases: number;
}

export interface CreateAliasRequest {
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash: string;
  domain: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  captcha_token?: string;
}

export interface CreateAliasResponse {
  id: string;
  success: boolean;
}

export interface UpdateAliasRequest {
  encrypted_display_name?: string;
  display_name_nonce?: string;
  is_enabled?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  delivery_label_token?: string | null;
  profile_picture?: string | null;
  encrypted_local_part?: string;
  local_part_nonce?: string;
  encrypted_note?: string | null;
  note_nonce?: string | null;
  encrypted_websites?: string | null;
  websites_nonce?: string | null;
  routing_address_hash?: string;
}

export interface AliasLimitResponse {
  current_count: number;
  max_aliases: number;
  can_create: boolean;
}

export interface CheckAvailabilityResponse {
  available: boolean;
}

export interface AliasCountsResponse {
  count: number;
  max: number;
  can_create: boolean;
}

export interface AliasUnreadCount {
  alias_address_hash: string;
  count: number;
}

export interface AliasUnreadCountsResponse {
  counts: AliasUnreadCount[];
}

export interface DeletedAlias {
  id: string;
  original_alias_id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  is_random: boolean;
  profile_picture?: string;
  deleted_at: string;
}

export interface ListDeletedAliasesResponse {
  aliases: DeletedAlias[];
  total: number;
}

export interface AliasStats {
  received: number;
  forwarded: number;
  blocked: number;
  replied: number;
  distinct_senders: number;
  created_at: string;
  last_sender_at?: string | null;
  last_sender_encrypted?: string | null;
  last_sender_nonce?: string | null;
}

export interface AliasActivityDay {
  date: string;
  received: number;
  blocked: number;
  forwarded: number;
}

export interface AliasActivityResponse {
  days: AliasActivityDay[];
}

export interface AliasRun {
  run_id: string;
  alias_id: string;
  status: string;
  include_trashed: boolean;
  scanned: number;
  matched: number;
  applied: number;
  total_estimate?: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
}

export interface AliasRunStatusResponse {
  run: AliasRun | null;
}

export interface BulkCreateAliasItem {
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  is_enabled?: boolean;
}

export interface BulkCreateAliasResponse {
  created: number;
  failed: number;
}

export interface AliasPreferences {
  alias_default_domain?: string;
  alias_sender_format: "via" | "at";
  readable_reverse_aliases: boolean;
  alias_always_expand: boolean;
  alias_unsubscribe_action: "preserve" | "disable_alias" | "block_contact";
  alias_disabled_response: "ignore" | "reject";
  alias_delete_action: "trash" | "immediate";
}

export interface DeliveryEvent {
  id: string;
  blocked_reason: "sender_pin" | "alias_rule" | "alias_disabled" | string;
  created_at: string;
}

export interface AliasDeliveryLogResponse {
  events: DeliveryEvent[];
  total: number;
}

