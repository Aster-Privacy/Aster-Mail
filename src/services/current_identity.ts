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
import { get_current_account, type User } from "@/services/account_manager";
import { api_client } from "@/services/api/client";
import { get_user_info } from "@/services/api/auth";

let session_user: User | null = null;

export function remember_current_user(user: User | null): void {
  if (!user?.email) return;

  session_user = user;
}

export function forget_current_user(): void {
  session_user = null;
}

export function peek_current_user(): User | null {
  return session_user;
}

function from_cached_info(): User | null {
  const cached = api_client.get_cached_user_info();

  if (!cached?.email) return null;

  return {
    id: cached.user_id,
    username: cached.username ?? cached.email.split("@")[0] ?? "",
    email: cached.email,
    display_name: cached.display_name || undefined,
    profile_color: cached.profile_color || undefined,
    profile_picture: cached.profile_picture || undefined,
  };
}

async function from_server(): Promise<User | null> {
  if (!api_client.is_authenticated()) return null;

  try {
    const response = await get_user_info();
    const info = response?.data;

    if (!info?.email || !info.user_id) return null;

    api_client.adopt_user_info({
      user_id: info.user_id,
      username: info.username,
      email: info.email,
      display_name: info.display_name,
      profile_color: info.profile_color,
      profile_picture: info.profile_picture,
      lockdown_mode_enabled: info.lockdown_mode_enabled,
    });

    return {
      id: info.user_id,
      username: info.username ?? info.email.split("@")[0] ?? "",
      email: info.email,
      display_name: info.display_name || undefined,
      profile_color: info.profile_color || undefined,
      profile_picture: info.profile_picture || undefined,
    };
  } catch {
    return null;
  }
}

export async function resolve_current_user(
  options: { allow_network?: boolean } = {},
): Promise<User | null> {
  const account = await get_current_account();

  if (account?.user?.email) {
    session_user = account.user;

    return account.user;
  }

  const cached = from_cached_info();

  if (cached) {
    session_user = cached;

    return cached;
  }

  if (session_user?.email) return session_user;

  if (options.allow_network === false) return account?.user ?? null;

  const fetched = await from_server();

  if (fetched) {
    session_user = fetched;

    return fetched;
  }

  return account?.user ?? null;
}
