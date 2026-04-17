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
export type {
  ExternalAccountData,
  ExternalAccountCredentials,
  ExternalAccountResponse,
  DecryptedExternalAccount,
  SyncFrequency,
  ExternalAccountSyncSettings,
  ExternalAccountFolder,
  ExternalAccountHealthStatus,
  SyncProgressEvent,
  ExternalAccountAdvancedSettings,
  TestConnectionResult,
  SyncResult,
  DeduplicationRecord,
} from "./types";

export {
  generate_account_token,
  encrypt_account_data,
  decrypt_account_data,
} from "./crypto";

export {
  list_external_accounts,
  create_external_account,
  update_external_account,
  toggle_external_account,
  delete_external_account,
  bulk_delete_external_accounts,
  purge_external_account_mail,
  test_external_connection,
  trigger_sync,
  send_via_external_account,
  list_account_folders,
  update_sync_settings,
  get_sync_settings,
  check_account_health,
  get_sync_progress,
  update_advanced_settings,
  get_advanced_settings,
  test_smtp_connection,
  start_oauth_authorize,
  get_dedup_stats,
  list_oauth_folders,
  save_folder_mapping,
} from "./api";

export type { OAuthFolderInfo } from "./api";
