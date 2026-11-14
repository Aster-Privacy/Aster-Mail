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
import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";

import { NATIVE_REFRESH_TOKEN_KEY, NATIVE_TOKEN_KEY } from "./helpers";

import { ignore_error } from "@/lib/ignore_error";

export type NativeTokenKind = "access" | "refresh";

export interface SecureTokenBackend {
  is_available: () => Promise<boolean>;
  read: (slot: string) => Promise<string | null>;
  write: (slot: string, value: string) => Promise<void>;
  remove: (slot: string) => Promise<void>;
}

export interface LegacyTokenPreferences {
  get: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
}

export interface NativeTokenStore {
  persist: (kind: NativeTokenKind, token: string) => Promise<void>;
  load: (kind: NativeTokenKind) => Promise<string | null>;
  clear: (kind: NativeTokenKind) => Promise<void>;
  clear_all: () => Promise<void>;
  migrate_legacy: () => Promise<void>;
}

const NATIVE_TOKEN_KINDS: NativeTokenKind[] = ["access", "refresh"];

const LEGACY_KEYS: Record<NativeTokenKind, string> = {
  access: NATIVE_TOKEN_KEY,
  refresh: NATIVE_REFRESH_TOKEN_KEY,
};

export function native_token_slot(
  prefix: string,
  kind: NativeTokenKind,
): string {
  return `${prefix}.session.${kind}`;
}

export function create_native_token_store(deps: {
  slot_prefix: string;
  secure: SecureTokenBackend;
  legacy: LegacyTokenPreferences;
}): NativeTokenStore {
  const memory = new Map<NativeTokenKind, string>();
  let migration: Promise<void> | null = null;

  const slot_of = (kind: NativeTokenKind): string =>
    native_token_slot(deps.slot_prefix, kind);

  const secure_available = async (): Promise<boolean> => {
    try {
      return await deps.secure.is_available();
    } catch {
      return false;
    }
  };

  const read_secure = async (kind: NativeTokenKind): Promise<string | null> => {
    try {
      return await deps.secure.read(slot_of(kind));
    } catch {
      return null;
    }
  };

  const remove_legacy = async (kind: NativeTokenKind): Promise<void> => {
    try {
      await deps.legacy.remove(LEGACY_KEYS[kind]);
    } catch (caught) {
      ignore_error("services/api/client/native_token_store:remove_legacy", caught);
    }
  };

  const migrate_kind = async (
    kind: NativeTokenKind,
    has_secure: boolean,
  ): Promise<void> => {
    let legacy_value: string | null = null;

    try {
      legacy_value = await deps.legacy.get(LEGACY_KEYS[kind]);
    } catch {
      legacy_value = null;
    }

    if (!legacy_value) return;

    if (!memory.has(kind)) {
      const existing = has_secure ? await read_secure(kind) : null;

      if (!existing) {
        memory.set(kind, legacy_value);
        if (has_secure) {
          try {
            await deps.secure.write(slot_of(kind), legacy_value);
          } catch (caught) {
            ignore_error(
              "services/api/client/native_token_store:migrate_kind",
              caught,
            );
          }
        }
      }
    }

    await remove_legacy(kind);
  };

  const run_migration = async (): Promise<void> => {
    const has_secure = await secure_available();

    for (const kind of NATIVE_TOKEN_KINDS) {
      await migrate_kind(kind, has_secure);
    }
  };

  const migrate_legacy = (): Promise<void> => {
    if (!migration) {
      migration = run_migration().catch((caught) => {
        ignore_error(
          "services/api/client/native_token_store:migrate_legacy",
          caught,
        );
      });
    }

    return migration;
  };

  const persist = async (
    kind: NativeTokenKind,
    token: string,
  ): Promise<void> => {
    await migrate_legacy();
    memory.set(kind, token);
    if (!(await secure_available())) return;
    try {
      await deps.secure.write(slot_of(kind), token);
    } catch (caught) {
      ignore_error("services/api/client/native_token_store:persist", caught);
    }
  };

  const load = async (kind: NativeTokenKind): Promise<string | null> => {
    await migrate_legacy();
    const in_memory = memory.get(kind);

    if (in_memory) return in_memory;
    if (!(await secure_available())) return null;
    const stored = await read_secure(kind);

    if (stored) memory.set(kind, stored);

    return stored;
  };

  const clear = async (kind: NativeTokenKind): Promise<void> => {
    await migrate_legacy();
    memory.delete(kind);
    if (await secure_available()) {
      try {
        await deps.secure.remove(slot_of(kind));
      } catch (caught) {
        ignore_error("services/api/client/native_token_store:clear", caught);
      }
    }
    await remove_legacy(kind);
  };

  const clear_all = async (): Promise<void> => {
    for (const kind of NATIVE_TOKEN_KINDS) {
      await clear(kind);
    }
  };

  return { persist, load, clear, clear_all, migrate_legacy };
}

const NATIVE_CREDENTIALS_PLUGIN = "NativeBiometric";
const SECURE_TOKEN_USERNAME = "aster_session";

const keystore_backend: SecureTokenBackend = {
  is_available: async () =>
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable(NATIVE_CREDENTIALS_PLUGIN),
  read: async (slot) => {
    try {
      const credentials = await NativeBiometric.getCredentials({
        server: slot,
      });

      return credentials.password || null;
    } catch {
      return null;
    }
  },
  write: async (slot, value) => {
    await NativeBiometric.setCredentials({
      username: SECURE_TOKEN_USERNAME,
      password: value,
      server: slot,
    });
  },
  remove: async (slot) => {
    await NativeBiometric.deleteCredentials({ server: slot });
  },
};

const capacitor_legacy_preferences: LegacyTokenPreferences = {
  get: async (key) => {
    if (!Capacitor.isNativePlatform()) return null;
    const { Preferences } = await import("@capacitor/preferences");
    const result = await Preferences.get({ key });

    return result.value;
  },
  remove: async (key) => {
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import("@capacitor/preferences");

    await Preferences.remove({ key });
  },
};

export const native_token_store = create_native_token_store({
  slot_prefix: "com.astermail.app",
  secure: keystore_backend,
  legacy: capacitor_legacy_preferences,
});
