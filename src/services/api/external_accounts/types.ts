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

export interface ExternalAccountData {
  email: string;
  display_name: string;
  label_name: string;
  label_color: string;
  created_at: string;
}

export interface ExternalAccountCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  use_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
}

export interface ExternalAccountResponse {
  id: string;
  account_token: string;
  encrypted_account_data: string;
  account_data_nonce: string;
  integrity_hash: string;
  protocol: string;
  is_enabled: boolean;
  is_verified: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  email_count: number;
  created_at: string;
  updated_at: string;
}

export interface DecryptedExternalAccount {
  id: string;
  account_token: string;
  email: string;
  display_name: string;
  label_name: string;
  label_color: string;
  protocol: string;
  is_enabled: boolean;
  is_verified: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  email_count: number;
  created_at: string;
  updated_at: string;
}

export type SyncFrequency =
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "6h"
  | "manual";

export interface ExternalAccountSyncSettings {
  sync_frequency: SyncFrequency;
  sync_folders: string[];
  max_messages_per_sync: number;
  sync_since_date: string | null;
}

export interface ExternalAccountFolder {
  name: string;
  path: string;
  delimiter: string;
  message_count: number;
  unseen_count: number;
  hasChildren: boolean;
  is_selectable: boolean;
}

export interface ExternalAccountHealthStatus {
  account_token: string;
  imap_connected: boolean;
  smtp_connected: boolean;
  last_imap_error: string | null;
  last_smtp_error: string | null;
  last_auth_error: string | null;
  auth_failure_count: number;
  requires_reauth: boolean;
  last_health_check_at: string | null;
  server_capabilities: string[];
}

export interface SyncProgressEvent {
  account_token: string;
  status:
    | "started"
    | "fetching"
    | "processing"
    | "encrypting"
    | "complete"
    | "error";
  total_messages: number;
  processed_messages: number;
  current_folder: string;
  error_message: string | null;
}

export interface ExternalAccountAdvancedSettings {
  tls_method: "auto" | "starttls" | "implicit" | "none";
  connection_timeout_seconds: number;
  idle_timeout_seconds: number;
  max_concurrent_connections: number;
  archive_sent_to_remote: boolean;
  delete_after_fetch: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  imap_status: "ok" | "error" | "skipped";
  smtp_status: "ok" | "error" | "skipped";
  imap_error: string | null;
  smtp_error: string | null;
  server_capabilities: string[];
  tls_info: string | null;
}

export interface SyncResult {
  success: boolean;
  message: string;
  new_messages: number;
  updated_messages: number;
  duplicate_count: number;
  folders_synced: string[];
  duration_ms: number;
}

export interface DeduplicationRecord {
  message_id: string;
  account_token: string;
  folder: string;
  uid: number;
  fetched_at: string;
}
