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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { FormatClassId } from "./switches";

export interface MigratorContext {
  user_id: string;
  vault: EncryptedVault;
  state: Record<string, unknown>;
  is_active: () => boolean;
}

export interface BatchResult {
  examined: number;
  migrated: number;
  failed: number;
  done: boolean;
}

export interface FormatMigrator {
  id: FormatClassId;
  version: number;
  detect(ctx: MigratorContext): Promise<boolean>;
  count(ctx: MigratorContext): Promise<number | null>;
  rewrap_batch(ctx: MigratorContext, limit: number): Promise<BatchResult>;
  verify(ctx: MigratorContext): Promise<boolean>;
}

const registry = new Map<FormatClassId, FormatMigrator>();

export function register_migrator(migrator: FormatMigrator): void {
  registry.set(migrator.id, migrator);
}

export function list_migrators(): FormatMigrator[] {
  return [...registry.values()];
}

export function clear_migrators(): void {
  registry.clear();
}

export const NOTHING_TO_DO: BatchResult = {
  examined: 0,
  migrated: 0,
  failed: 0,
  done: true,
};
