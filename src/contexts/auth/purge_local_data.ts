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
import { clear_all_session_passphrases } from "./session_passphrase";

import { api_client } from "@/services/api/client";
import { wipe_all_storage } from "@/services/crypto/secure_storage";
import {
  logout_all as storage_logout_all,
  clear_cache,
  clear_all_switch_tokens,
} from "@/services/account_manager";
import {
  clear_session,
  clear_all_session_data,
} from "@/services/secure_storage";
import { stop_session_timeout } from "@/services/session_timeout_service";
import { sync_client } from "@/services/sync_client";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";

export async function purge_all_local_data(): Promise<void> {
  const errors: Error[] = [];

  stop_session_timeout();
  sync_client.disconnect();

  try {
    await wipe_all_storage();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await storage_logout_all();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  clear_cache();
  clear_mail_stats();
  clear_mail_cache();
  clear_recovery_email_cache();
  clear_session();
  clear_all_switch_tokens();

  try {
    await clear_all_session_data();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  api_client.clear_auth_data();
  try {
    await api_client.clear_session_cookies();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  try {
    await clear_all_session_passphrases();
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }

  if (errors.length > 0 && import.meta.env.DEV) {
    errors.forEach((err) => console.error("purge_all_local_data:", err));
  }
}
