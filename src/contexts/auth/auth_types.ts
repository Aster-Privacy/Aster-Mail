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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { User, StoredAccount } from "@/services/account_manager";
import type { ReactNode } from "react";

export interface AuthState {
  user: User | null;
  is_loading: boolean;
  is_authenticated: boolean;
  has_keys: boolean;
  accounts: StoredAccount[];
  current_account_id: string | null;
}

export interface AuthContextType extends AuthState {
  vault: EncryptedVault | null;
  login: (
    user: User,
    vault: EncryptedVault,
    passphrase: string,
    encrypted_vault?: string,
    vault_nonce?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  logout_all: () => Promise<void>;
  set_vault: (vault: EncryptedVault, passphrase: string) => Promise<void>;
  add_account: (
    user: User,
    vault: EncryptedVault,
    passphrase: string,
    encrypted_vault?: string,
    vault_nonce?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  remove_account: (account_id: string) => Promise<void>;
  switch_to_account: (account_id: string) => Promise<void>;
  can_add_account: () => Promise<boolean>;
  account_count: number;
  is_adding_account: boolean;
  set_is_adding_account: (value: boolean) => void;
  update_user: (updated_user: User) => Promise<void>;
  is_completing_registration: boolean;
  set_is_completing_registration: (value: boolean) => void;
}

export interface AuthProviderProps {
  children: ReactNode;
}
