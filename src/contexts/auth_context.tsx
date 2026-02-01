import type { EncryptedVault } from "@/services/crypto/key_manager";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

import { api_client } from "@/services/api/client";
import { verify_auth_status } from "@/services/api/auth";
import { decrypt_vault } from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  clear_vault_from_memory,
  has_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import {
  type User,
  type StoredAccount,
  initialize_accounts,
  get_all_accounts,
  get_current_account,
  add_account as storage_add_account,
  switch_account as storage_switch_account,
  remove_account as storage_remove_account,
  logout_all as storage_logout_all,
  can_add_account as storage_can_add_account,
  update_account_user,
  clear_cache,
} from "@/services/account_manager";
import {
  clear_session,
  clear_all_session_data,
} from "@/services/secure_storage";
import { wipe_all_storage } from "@/services/crypto/secure_storage";
import { sync_client } from "@/services/sync_client";
import {
  start_session_timeout,
  stop_session_timeout,
  check_session_expired,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import { is_auth_page } from "@/lib/auth_utils";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { emit_keys_ready } from "@/hooks/mail_events";

const ENCRYPTED_VAULT_KEY_PREFIX = "astermail_encrypted_vault_";
const VAULT_NONCE_KEY_PREFIX = "astermail_vault_nonce_";
const SESSION_PASSPHRASE_KEY_PREFIX = "astermail_session_passphrase_";
const SESSION_PASSPHRASE_IV_KEY_PREFIX = "astermail_session_passphrase_iv_";
const SESSION_TIMESTAMP_KEY_PREFIX = "astermail_session_timestamp_";

const SESSION_KEY_DB_NAME = "astermail_session_keys";
const SESSION_KEY_STORE = "keys";
const SESSION_KEY_ID = "session_encryption_key";

let session_encryption_key: CryptoKey | null = null;
let vault_decryption_lock: Promise<void> | null = null;

const IDB_OPEN_TIMEOUT_MS = 10000;

function open_session_key_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      reject(new Error("IndexedDB open timed out"));
    }, IDB_OPEN_TIMEOUT_MS);

    const request = indexedDB.open(SESSION_KEY_DB_NAME, 1);

    request.onerror = () => {
      clearTimeout(timeout_id);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout_id);
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSION_KEY_STORE)) {
        db.createObjectStore(SESSION_KEY_STORE, { keyPath: "id" });
      }
    };

    request.onblocked = () => {
      clearTimeout(timeout_id);
      reject(new Error("IndexedDB blocked by another connection"));
    };
  });
}

async function store_session_key_in_db(key: CryptoKey): Promise<void> {
  const db = await open_session_key_db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_KEY_STORE, "readwrite");
    const store = tx.objectStore(SESSION_KEY_STORE);
    const request = store.put({ id: SESSION_KEY_ID, key });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

async function get_session_key_from_db(): Promise<CryptoKey | null> {
  try {
    const db = await open_session_key_db();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_KEY_STORE, "readonly");
      const store = tx.objectStore(SESSION_KEY_STORE);
      const request = store.get(SESSION_KEY_ID);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;

        resolve(result?.key || null);
      };
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function clear_session_key_from_db(): Promise<void> {
  try {
    const db = await open_session_key_db();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_KEY_STORE, "readwrite");
      const store = tx.objectStore(SESSION_KEY_STORE);
      const request = store.delete(SESSION_KEY_ID);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    return;
  }
}

async function get_or_create_session_key(): Promise<CryptoKey> {
  if (session_encryption_key) {
    return session_encryption_key;
  }

  const stored_key = await get_session_key_from_db();

  if (stored_key) {
    session_encryption_key = stored_key;

    return session_encryption_key;
  }

  session_encryption_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  await store_session_key_in_db(session_encryption_key);

  return session_encryption_key;
}

async function clear_session_key(): Promise<void> {
  session_encryption_key = null;
  await clear_session_key_from_db();
}

function store_encrypted_vault(
  account_id: string,
  encrypted_vault: string,
  vault_nonce: string,
): void {
  localStorage.setItem(
    ENCRYPTED_VAULT_KEY_PREFIX + account_id,
    encrypted_vault,
  );
  localStorage.setItem(VAULT_NONCE_KEY_PREFIX + account_id, vault_nonce);
  localStorage.setItem(
    SESSION_TIMESTAMP_KEY_PREFIX + account_id,
    Date.now().toString(),
  );
}

function get_stored_encrypted_vault(account_id: string): {
  encrypted_vault: string;
  vault_nonce: string;
} | null {
  if (check_session_expired(account_id)) {
    clear_stored_encrypted_vault(account_id);
    clear_session_timeout_data(account_id);

    return null;
  }

  const encrypted_vault = localStorage.getItem(
    ENCRYPTED_VAULT_KEY_PREFIX + account_id,
  );
  const vault_nonce = localStorage.getItem(VAULT_NONCE_KEY_PREFIX + account_id);

  return encrypted_vault && vault_nonce
    ? { encrypted_vault, vault_nonce }
    : null;
}

async function store_session_passphrase(
  account_id: string,
  passphrase: string,
): Promise<void> {
  const key = await get_or_create_session_key();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(passphrase);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  const encrypted_base64 = btoa(
    String.fromCharCode(...new Uint8Array(encrypted)),
  );
  const iv_base64 = btoa(String.fromCharCode(...iv));

  localStorage.setItem(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
    encrypted_base64,
  );
  localStorage.setItem(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
    iv_base64,
  );
}

async function get_session_passphrase(
  account_id: string,
): Promise<string | null> {
  const encrypted_base64 = localStorage.getItem(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
  );
  const iv_base64 = localStorage.getItem(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
  );

  if (!encrypted_base64 || !iv_base64) {
    return null;
  }

  if (!session_encryption_key) {
    const stored_key = await get_session_key_from_db();

    if (stored_key) {
      session_encryption_key = stored_key;
    } else {
      return null;
    }
  }

  try {
    const encrypted = Uint8Array.from(atob(encrypted_base64), (c) =>
      c.charCodeAt(0),
    );
    const iv = Uint8Array.from(atob(iv_base64), (c) => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      session_encryption_key,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

async function clear_session_passphrase(account_id: string): Promise<void> {
  localStorage.removeItem(SESSION_PASSPHRASE_KEY_PREFIX + account_id);
  localStorage.removeItem(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id);
}

async function clear_all_session_passphrases(): Promise<void> {
  const keys_to_remove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (
      key &&
      (key.startsWith(SESSION_PASSPHRASE_KEY_PREFIX) ||
        key.startsWith(SESSION_PASSPHRASE_IV_KEY_PREFIX) ||
        key.startsWith(ENCRYPTED_VAULT_KEY_PREFIX) ||
        key.startsWith(VAULT_NONCE_KEY_PREFIX) ||
        key.startsWith(SESSION_TIMESTAMP_KEY_PREFIX))
    ) {
      keys_to_remove.push(key);
    }
  }

  keys_to_remove.forEach((key) => localStorage.removeItem(key));
  await clear_session_key();
}

function clear_stored_encrypted_vault(account_id: string): void {
  localStorage.removeItem(ENCRYPTED_VAULT_KEY_PREFIX + account_id);
  localStorage.removeItem(VAULT_NONCE_KEY_PREFIX + account_id);
  localStorage.removeItem(SESSION_TIMESTAMP_KEY_PREFIX + account_id);
}

async function decrypt_vault_with_lock(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
): Promise<EncryptedVault | null> {
  if (has_vault_in_memory()) {
    return get_vault_from_memory();
  }

  if (vault_decryption_lock) {
    await vault_decryption_lock;
    if (has_vault_in_memory()) {
      return get_vault_from_memory();
    }
  }

  let resolve_lock: (() => void) | undefined;

  vault_decryption_lock = new Promise<void>((resolve) => {
    resolve_lock = resolve;
  });

  try {
    if (has_vault_in_memory()) {
      return get_vault_from_memory();
    }

    const vault = await decrypt_vault(encrypted_vault, vault_nonce, passphrase);

    await store_vault_in_memory(vault, passphrase);

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}

interface AuthState {
  user: User | null;
  is_loading: boolean;
  is_authenticated: boolean;
  has_keys: boolean;
  accounts: StoredAccount[];
  current_account_id: string | null;
}

interface AuthContextType extends AuthState {
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
  switch_account: (account_id: string) => Promise<boolean>;
  remove_account: (account_id: string) => Promise<void>;
  can_add_account: () => Promise<boolean>;
  account_count: number;
  is_adding_account: boolean;
  set_is_adding_account: (value: boolean) => void;
  update_user: (updated_user: User) => Promise<void>;
  is_completing_registration: boolean;
  set_is_completing_registration: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, set_state] = useState<AuthState>({
    user: null,
    is_loading: true,
    is_authenticated: false,
    has_keys: false,
    accounts: [],
    current_account_id: null,
  });

  const [is_adding_account, set_is_adding_account] = useState(false);
  const [is_completing_registration, set_is_completing_registration] =
    useState(false);

  useEffect(() => {
    const init = async () => {
      const on_auth_page = is_auth_page();

      try {
        const data = await initialize_accounts();
        const current = await get_current_account();

        if (!current) {
          api_client.set_authenticated(false);
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          }));

          return;
        }

        if (on_auth_page) {
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          }));

          return;
        }

        const is_auth_valid = await verify_auth_status();

        if (is_auth_valid) {
          api_client.set_authenticated(true);
          sync_client.connect().catch(() => {
            window.dispatchEvent(
              new CustomEvent("astermail:sync-connection-failed"),
            );
          });

          let has_keys = has_vault_in_memory();

          if (!has_keys) {
            const stored_passphrase = await get_session_passphrase(current.id);
            const stored_vault = get_stored_encrypted_vault(current.id);

            if (stored_passphrase && stored_vault) {
              try {
                const vault = await decrypt_vault_with_lock(
                  stored_vault.encrypted_vault,
                  stored_vault.vault_nonce,
                  stored_passphrase,
                );

                has_keys = vault !== null;
              } catch {
                await clear_session_passphrase(current.id);
              }
            }
          }

          if (has_keys) {
            start_session_timeout(current.id);
          }

          set_state({
            user: current.user,
            is_loading: false,
            is_authenticated: true,
            has_keys,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          });

          if (has_keys) {
            emit_keys_ready();
          }
        } else {
          api_client.set_authenticated(false);
          clear_vault_from_memory();
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          }));
        }
      } catch {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
        }));
      }
    };

    init();
  }, []);

  const login = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
    ) => {
      await store_vault_in_memory(vault, passphrase);
      await store_session_passphrase(user.id, passphrase);

      if (encrypted_vault && vault_nonce) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      await storage_add_account(user);

      api_client.set_authenticated(true);
      sync_client.connect().catch(() => {
        window.dispatchEvent(
          new CustomEvent("astermail:sync-connection-failed"),
        );
      });

      start_session_timeout(user.id);

      const accounts = await get_all_accounts();

      set_state({
        user,
        is_loading: false,
        is_authenticated: true,
        has_keys: true,
        accounts,
        current_account_id: user.id,
      });
      set_is_adding_account(false);

      emit_keys_ready();
    },
    [],
  );

  const add_account = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
    ) => {
      await store_vault_in_memory(vault, passphrase);
      await store_session_passphrase(user.id, passphrase);

      if (encrypted_vault && vault_nonce) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      const result = await storage_add_account(user);

      if (result.success) {
        api_client.set_authenticated(true);
        sync_client.disconnect();
        sync_client.connect().catch(() => {
          window.dispatchEvent(
            new CustomEvent("astermail:sync-connection-failed"),
          );
        });

        start_session_timeout(user.id);

        const accounts = await get_all_accounts();

        set_state({
          user,
          is_loading: false,
          is_authenticated: true,
          has_keys: true,
          accounts,
          current_account_id: user.id,
        });
        set_is_adding_account(false);

        emit_keys_ready();
      }

      return result;
    },
    [],
  );

  const switch_account_handler = useCallback(
    async (account_id: string) => {
      const old_account_id = state.current_account_id;

      stop_session_timeout();

      try {
        await api_client.post("/auth/logout", {});
      } catch {
        return false;
      }

      sync_client.disconnect();
      clear_vault_from_memory();
      clear_cache();
      clear_mail_stats();
      clear_mail_cache();
      clear_session();
      api_client.clear_auth_data();

      if (old_account_id) {
        clear_stored_encrypted_vault(old_account_id);
        await clear_session_passphrase(old_account_id);
        clear_session_timeout_data(old_account_id);
      }

      const account = await storage_switch_account(account_id);

      if (account) {
        set_state({
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
          accounts: await get_all_accounts(),
          current_account_id: account_id,
        });

        return true;
      }

      return false;
    },
    [state.current_account_id],
  );

  const remove_account_handler = useCallback(
    async (account_id: string) => {
      const is_current = account_id === state.current_account_id;

      if (is_current) {
        sync_client.disconnect();
        try {
          await api_client.post("/auth/logout", {});
        } catch {
          // proceed with local cleanup
        }
        api_client.clear_auth_data();
      }

      const result = await storage_remove_account(account_id);

      if (result.removed) {
        stop_session_timeout();
        clear_vault_from_memory();
        clear_mail_stats();
        clear_mail_cache();
        clear_stored_encrypted_vault(account_id);
        await clear_session_passphrase(account_id);
        clear_session_timeout_data(account_id);

        const switched_account = result.switched_to;

        if (switched_account) {
          const accounts = await get_all_accounts();

          let has_keys = false;
          const stored_passphrase = await get_session_passphrase(
            switched_account.id,
          );
          const stored_vault = get_stored_encrypted_vault(switched_account.id);

          if (stored_passphrase && stored_vault) {
            try {
              const vault = await decrypt_vault_with_lock(
                stored_vault.encrypted_vault,
                stored_vault.vault_nonce,
                stored_passphrase,
              );

              has_keys = vault !== null;

              if (has_keys) {
                start_session_timeout(switched_account.id);
              }
            } catch {
              await clear_session_passphrase(switched_account.id);
            }
          }

          set_state((prev) => ({
            ...prev,
            user: switched_account.user,
            is_authenticated: true,
            has_keys,
            accounts,
            current_account_id: switched_account.id,
          }));
        } else {
          api_client.set_authenticated(false);
          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: [],
            current_account_id: null,
          });
        }
      }
    },
    [state.current_account_id],
  );

  const logout = useCallback(async () => {
    if (state.current_account_id) {
      await remove_account_handler(state.current_account_id);
    }
  }, [state.current_account_id, remove_account_handler]);

  const clear_local_auth_data = useCallback(async () => {
    stop_session_timeout();
    sync_client.disconnect();

    await wipe_all_storage();

    await storage_logout_all();
    clear_cache();
    clear_mail_stats();
    clear_mail_cache();
    clear_session();
    await clear_all_session_data();
    api_client.clear_auth_data();
    api_client.clear_session_cookies();

    await clear_all_session_passphrases();

    set_state({
      user: null,
      is_loading: false,
      is_authenticated: false,
      has_keys: false,
      accounts: [],
      current_account_id: null,
    });
  }, []);

  const logout_all_handler = useCallback(async () => {
    sync_client.disconnect();

    try {
      await api_client.post("/auth/logout-all", {});
    } catch {
      return;
    }

    await clear_local_auth_data();
  }, [clear_local_auth_data]);

  useEffect(() => {
    const handle_session_expired = () => {
      clear_local_auth_data();
    };

    const handle_session_timeout = () => {
      stop_session_timeout();
      clear_vault_from_memory();

      if (state.current_account_id) {
        clear_stored_encrypted_vault(state.current_account_id);
        clear_session_passphrase(state.current_account_id);
        clear_session_timeout_data(state.current_account_id);
      }

      set_state((prev) => ({
        ...prev,
        has_keys: false,
      }));

      window.dispatchEvent(new CustomEvent("astermail:session-locked"));
    };

    window.addEventListener(
      "astermail:session-expired",
      handle_session_expired,
    );

    window.addEventListener(
      "astermail:session-timeout",
      handle_session_timeout,
    );

    return () => {
      window.removeEventListener(
        "astermail:session-expired",
        handle_session_expired,
      );
      window.removeEventListener(
        "astermail:session-timeout",
        handle_session_timeout,
      );
    };
  }, [logout_all_handler, state.current_account_id]);

  useEffect(() => {
    const handle_focus = () => {
      verify_auth_status().then((is_valid) => {
        if (!is_valid && state.is_authenticated) {
          clear_local_auth_data();
        }
      });
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [clear_local_auth_data, state.is_authenticated]);

  const set_vault = useCallback(
    async (vault: EncryptedVault, passphrase: string) => {
      await store_vault_in_memory(vault, passphrase);

      if (state.current_account_id) {
        start_session_timeout(state.current_account_id);
      }

      set_state((prev) => ({ ...prev, has_keys: true }));

      emit_keys_ready();
    },
    [state.current_account_id],
  );

  const can_add = useCallback(async () => {
    return await storage_can_add_account();
  }, []);

  const update_user = useCallback(
    async (updated_user: User) => {
      if (state.current_account_id) {
        await update_account_user(state.current_account_id, updated_user);
      }
      set_state((prev) => ({ ...prev, user: updated_user }));
    },
    [state.current_account_id],
  );

  const get_current_vault = useCallback((): EncryptedVault | null => {
    if (!state.has_keys && !is_completing_registration) {
      return null;
    }

    return get_vault_from_memory();
  }, [state.has_keys, is_completing_registration]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        vault: get_current_vault(),
        login,
        logout,
        logout_all: logout_all_handler,
        set_vault,
        add_account,
        switch_account: switch_account_handler,
        remove_account: remove_account_handler,
        can_add_account: can_add,
        account_count: state.accounts.length,
        is_adding_account,
        set_is_adding_account,
        update_user,
        is_completing_registration,
        set_is_completing_registration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function use_auth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("use_auth must be used within AuthProvider");
  }

  return context;
}

export function use_auth_safe(): AuthContextType | null {
  return useContext(AuthContext);
}
