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
  cancel_alias_run,
  get_alias_activity,
  get_alias_delivery_log,
  get_alias_run,
  get_domain_address_delivery_log,
  run_alias_on_existing,
} from "./activity";
export {
  backfill_missing_routing_hashes,
  reencrypt_all_aliases,
} from "./backfill";
export {
  bulk_create_aliases,
  check_alias_availability,
  create_alias,
  delete_alias,
  get_alias,
  get_alias_limit,
  get_twin_address,
  get_alias_preferences,
  reencrypt_alias_local_part,
  toggle_alias_pin,
  update_alias,
  update_alias_preferences,
} from "./crud";
export {
  compute_alias_hash,
  compute_routing_hash,
  decrypt_alias,
  decrypt_alias_field,
  decrypt_aliases,
  encrypt_alias_field,
} from "./crypto";
export {
  empty_deleted_aliases,
  get_alias_stats,
  purge_deleted_alias,
  restore_alias,
} from "./deleted";
export {
  get_alias_counts,
  get_alias_unread_counts,
  list_aliases,
  list_all_aliases,
  list_deleted_aliases,
} from "./list";
export type {
  AliasActivityDay,
  AliasActivityResponse,
  AliasCountsResponse,
  AliasDeliveryLogResponse,
  AliasLimitResponse,
  AliasListResponse,
  AliasPreferences,
  AliasRun,
  AliasRunStatusResponse,
  AliasStats,
  AliasUnreadCount,
  AliasUnreadCountsResponse,
  BulkCreateAliasItem,
  BulkCreateAliasResponse,
  CheckAvailabilityResponse,
  CreateAliasRequest,
  CreateAliasResponse,
  DecryptedEmailAlias,
  DeletedAlias,
  DeliveryEvent,
  EmailAlias,
  ListDeletedAliasesResponse,
  TwinAddressResponse,
  TwinAddressState,
  UpdateAliasRequest,
} from "./types";
export { validate_local_part } from "./validate";
export {
  MAX_ALIAS_WEBSITES,
  MAX_WEBSITE_URL_LENGTH,
  is_plausible_website_host,
  normalize_website_url,
  parse_websites_payload,
  validate_website_input,
} from "./website";
