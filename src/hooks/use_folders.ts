import { useState, useCallback, useEffect, useRef } from "react";

import {
  list_folders,
  create_folder,
  update_folder,
  delete_folder,
  get_folder_counts,
  type FolderDefinition,
  type CreateFolderRequest,
  type UpdateFolderRequest,
  type ListFoldersParams,
} from "@/services/api/folders";
import {
  add_mail_item_folder,
  remove_mail_item_folder,
} from "@/services/api/mail";
import {
  get_vault_from_memory,
  has_passphrase_in_memory,
} from "@/services/crypto/memory_key_store";
import { emit_folders_changed, MAIL_EVENTS } from "@/hooks/mail_events";
import { use_auth_safe } from "@/contexts/auth_context";

export interface DecryptedFolder {
  id: string;
  folder_token: string;
  name: string;
  color?: string;
  icon?: string;
  is_system: boolean;
  is_locked: boolean;
  folder_type: string;
  is_password_protected: boolean;
  password_set: boolean;
  sort_order: number;
  parent_token?: string;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

interface FoldersState {
  folders: DecryptedFolder[];
  is_loading: boolean;
  error: string | null;
  total: number;
}

interface FolderCounts {
  [folder_token: string]: number;
}

const cached_folders: { data: DecryptedFolder[]; total: number } = {
  data: [],
  total: 0,
};

interface UseFoldersReturn {
  state: FoldersState;
  counts: FolderCounts;
  fetch_folders: (params?: ListFoldersParams) => Promise<void>;
  fetch_counts: () => Promise<void>;
  create_new_folder: (
    name: string,
    color?: string,
    parent_token?: string,
  ) => Promise<DecryptedFolder | null>;
  update_existing_folder: (
    folder_id: string,
    name?: string,
    color?: string,
    sort_order?: number,
    parent_token?: string,
  ) => Promise<boolean>;
  delete_existing_folder: (folder_id: string) => Promise<boolean>;
  toggle_folder_lock: (
    folder_id: string,
    is_locked: boolean,
  ) => Promise<boolean>;
  add_folder_to_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  remove_folder_from_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  get_folder_by_token: (folder_token: string) => DecryptedFolder | undefined;
  get_folder_by_id: (folder_id: string) => DecryptedFolder | undefined;
  refresh: () => Promise<void>;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function generate_random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function generate_folder_token(): string {
  const bytes = generate_random_bytes(16);

  return array_to_base64(bytes);
}

async function derive_folder_key(identity_key: string): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-labels-v1",
  );
  const hash = await crypto.subtle.digest("SHA-256", key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_folder_field(
  field: string,
  identity_key: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_folder_key(identity_key);
  const nonce = generate_random_bytes(12);
  const data = new TextEncoder().encode(field);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
  };
}

async function decrypt_folder_field(
  encrypted: string,
  nonce: string,
  identity_key: string,
): Promise<string> {
  const key = await derive_folder_key(identity_key);
  const encrypted_data = base64_to_array(encrypted);
  const nonce_data = base64_to_array(nonce);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_data },
    key,
    encrypted_data,
  );

  return new TextDecoder().decode(decrypted);
}

async function decrypt_folder(
  folder: FolderDefinition,
  identity_key: string,
): Promise<DecryptedFolder | null> {
  let name = "";
  let color: string | undefined;
  let icon: string | undefined;

  try {
    name = await decrypt_folder_field(
      folder.encrypted_name,
      folder.name_nonce,
      identity_key,
    );
  } catch {
    return null;
  }

  if (folder.encrypted_color && folder.color_nonce) {
    try {
      color = await decrypt_folder_field(
        folder.encrypted_color,
        folder.color_nonce,
        identity_key,
      );
    } catch {
      color = undefined;
    }
  }

  if (folder.encrypted_icon && folder.icon_nonce) {
    try {
      icon = await decrypt_folder_field(
        folder.encrypted_icon,
        folder.icon_nonce,
        identity_key,
      );
    } catch {
      icon = undefined;
    }
  }

  return {
    id: folder.id,
    folder_token: folder.folder_token,
    name,
    color,
    icon,
    is_system: folder.is_system,
    is_locked: folder.is_locked ?? false,
    folder_type: folder.folder_type ?? "custom",
    is_password_protected: folder.is_password_protected ?? false,
    password_set: folder.password_set ?? false,
    sort_order: folder.sort_order,
    parent_token: folder.parent_token,
    item_count: folder.item_count,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  };
}

export function use_folders(): UseFoldersReturn {
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const [state, set_state] = useState<FoldersState>({
    folders: cached_folders.data,
    is_loading: cached_folders.data.length === 0,
    error: null,
    total: cached_folders.total,
  });
  const [counts, set_counts] = useState<FolderCounts>({});
  const abort_ref = useRef<AbortController | null>(null);
  const prev_user_id_ref = useRef<string | null>(null);

  const fetch_folders = useCallback(
    async (params: ListFoldersParams = {}): Promise<void> => {
      if (!has_passphrase_in_memory()) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
        }));

        return;
      }

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          error: "No vault available",
        }));

        return;
      }

      abort_ref.current?.abort();
      abort_ref.current = new AbortController();

      set_state((prev) => {
        if (prev.folders.length === 0) {
          return { ...prev, is_loading: true, error: null };
        }

        return prev;
      });

      try {
        const response = await list_folders({
          include_counts: true,
          ...params,
        });

        if (response.error || !response.data) {
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            error: response.error || "Failed to fetch folders",
          }));

          return;
        }

        const decrypted_results = await Promise.all(
          response.data.folders.map((folder: FolderDefinition) =>
            decrypt_folder(folder, vault.identity_key),
          ),
        );

        const decrypted_folders = decrypted_results.filter(
          (f): f is DecryptedFolder => f !== null,
        );

        cached_folders.data = decrypted_folders;
        cached_folders.total = decrypted_folders.length;

        set_state({
          folders: decrypted_folders,
          is_loading: false,
          error: null,
          total: response.data.total,
        });
      } catch (err) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch folders",
        }));
      }
    },
    [],
  );

  const fetch_counts = useCallback(async (): Promise<void> => {
    try {
      const response = await get_folder_counts();

      if (response.data) {
        const new_counts: FolderCounts = {};

        for (const item of response.data.counts) {
          new_counts[item.folder_token] = item.count;
        }
        set_counts(new_counts);
      }
    } catch {
      return;
    }
  }, []);

  const create_new_folder = useCallback(
    async (
      name: string,
      color?: string,
      parent_token?: string,
    ): Promise<DecryptedFolder | null> => {
      const trimmed_name = name.trim();

      if (!trimmed_name || trimmed_name.length > 100) {
        return null;
      }

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        return null;
      }

      const duplicate_exists = cached_folders.data.some(
        (f) => f.name.toLowerCase() === trimmed_name.toLowerCase(),
      );

      if (duplicate_exists) {
        return null;
      }

      try {
        const folder_token = generate_folder_token();

        const { encrypted: encrypted_name, nonce: name_nonce } =
          await encrypt_folder_field(trimmed_name, vault.identity_key);

        const request: CreateFolderRequest = {
          folder_token: folder_token,
          encrypted_name,
          name_nonce,
        };

        if (color) {
          const { encrypted: encrypted_color, nonce: color_nonce } =
            await encrypt_folder_field(color, vault.identity_key);

          request.encrypted_color = encrypted_color;
          request.color_nonce = color_nonce;
        }

        if (parent_token) {
          request.parent_token = parent_token;
        }

        const response = await create_folder(request);

        if (response.error || !response.data) {
          return null;
        }

        const new_folder: DecryptedFolder = {
          id: response.data.id,
          folder_token: response.data.folder_token,
          name: trimmed_name,
          color,
          is_system: false,
          is_locked: false,
          folder_type: "custom",
          is_password_protected: false,
          password_set: false,
          sort_order: 0,
          parent_token,
          item_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set_state((prev) => {
          const updated_folders = [...prev.folders, new_folder];

          cached_folders.data = updated_folders;
          cached_folders.total = updated_folders.length;

          return {
            ...prev,
            folders: updated_folders,
            total: updated_folders.length,
          };
        });

        emit_folders_changed();

        return new_folder;
      } catch {
        return null;
      }
    },
    [],
  );

  const update_existing_folder = useCallback(
    async (
      folder_id: string,
      name?: string,
      color?: string,
      sort_order?: number,
      parent_token?: string,
    ): Promise<boolean> => {
      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        return false;
      }

      try {
        const request: UpdateFolderRequest = {};

        if (name !== undefined) {
          const { encrypted, nonce } = await encrypt_folder_field(
            name,
            vault.identity_key,
          );

          request.encrypted_name = encrypted;
          request.name_nonce = nonce;
        }

        if (color !== undefined) {
          const { encrypted, nonce } = await encrypt_folder_field(
            color,
            vault.identity_key,
          );

          request.encrypted_color = encrypted;
          request.color_nonce = nonce;
        }

        if (sort_order !== undefined) {
          request.sort_order = sort_order;
        }

        if (parent_token !== undefined) {
          request.parent_token = parent_token;
        }

        const response = await update_folder(folder_id, request);

        if (response.error) {
          return false;
        }

        set_state((prev) => {
          const updated_folders = prev.folders.map((folder) =>
            folder.id === folder_id
              ? {
                  ...folder,
                  ...(name !== undefined && { name }),
                  ...(color !== undefined && { color }),
                  ...(sort_order !== undefined && { sort_order }),
                  ...(parent_token !== undefined && { parent_token }),
                  updated_at: new Date().toISOString(),
                }
              : folder,
          );

          cached_folders.data = updated_folders;
          cached_folders.total = updated_folders.length;

          return {
            ...prev,
            folders: updated_folders,
          };
        });

        emit_folders_changed();

        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const delete_existing_folder = useCallback(
    async (folder_id: string): Promise<boolean> => {
      try {
        const response = await delete_folder(folder_id);

        if (response.error) {
          return false;
        }

        set_state((prev) => {
          const updated_folders = prev.folders.filter(
            (folder) => folder.id !== folder_id,
          );

          cached_folders.data = updated_folders;
          cached_folders.total = updated_folders.length;

          return {
            ...prev,
            folders: updated_folders,
            total: updated_folders.length,
          };
        });

        emit_folders_changed();

        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const add_folder_to_email = useCallback(
    async (email_id: string, folder_token: string): Promise<boolean> => {
      set_counts((prev) => ({
        ...prev,
        [folder_token]: (prev[folder_token] || 0) + 1,
      }));

      try {
        const response = await add_mail_item_folder(email_id, { folder_token });

        if (response.error) {
          set_counts((prev) => ({
            ...prev,
            [folder_token]: Math.max(0, (prev[folder_token] || 1) - 1),
          }));

          return false;
        }

        return true;
      } catch {
        set_counts((prev) => ({
          ...prev,
          [folder_token]: Math.max(0, (prev[folder_token] || 1) - 1),
        }));

        return false;
      }
    },
    [],
  );

  const remove_folder_from_email = useCallback(
    async (email_id: string, folder_token: string): Promise<boolean> => {
      set_counts((prev) => ({
        ...prev,
        [folder_token]: Math.max(0, (prev[folder_token] || 0) - 1),
      }));

      try {
        const response = await remove_mail_item_folder(email_id, folder_token);

        if (response.error) {
          set_counts((prev) => ({
            ...prev,
            [folder_token]: (prev[folder_token] || 0) + 1,
          }));

          return false;
        }

        return true;
      } catch {
        set_counts((prev) => ({
          ...prev,
          [folder_token]: (prev[folder_token] || 0) + 1,
        }));

        return false;
      }
    },
    [],
  );

  const get_folder_by_token = useCallback(
    (folder_token: string): DecryptedFolder | undefined => {
      return state.folders.find(
        (folder) => folder.folder_token === folder_token,
      );
    },
    [state.folders],
  );

  const get_folder_by_id = useCallback(
    (folder_id: string): DecryptedFolder | undefined => {
      return state.folders.find((folder) => folder.id === folder_id);
    },
    [state.folders],
  );

  const toggle_folder_lock = useCallback(
    async (folder_id: string, is_locked: boolean): Promise<boolean> => {
      try {
        const response = await update_folder(folder_id, { is_locked });

        if (response.error) {
          return false;
        }

        set_state((prev) => {
          const updated_folders = prev.folders.map((folder) =>
            folder.id === folder_id
              ? { ...folder, is_locked, updated_at: new Date().toISOString() }
              : folder,
          );

          cached_folders.data = updated_folders;
          cached_folders.total = updated_folders.length;

          return {
            ...prev,
            folders: updated_folders,
          };
        });

        emit_folders_changed();

        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([fetch_folders(), fetch_counts()]);
  }, [fetch_folders, fetch_counts]);

  useEffect(() => {
    const current_user_id = user?.id || null;
    const prev_user_id = prev_user_id_ref.current;

    if (prev_user_id !== null && prev_user_id !== current_user_id) {
      cached_folders.data = [];
      cached_folders.total = 0;
      set_state({
        folders: [],
        is_loading: true,
        error: null,
        total: 0,
      });
      set_counts({});
    }

    prev_user_id_ref.current = current_user_id;
  }, [user?.id]);

  useEffect(() => {
    if (has_passphrase_in_memory()) {
      refresh();
    }

    return () => {
      abort_ref.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const counts_handler = () => {
      if (has_passphrase_in_memory()) {
        fetch_counts();
      }
    };

    const folders_handler = () => {
      if (has_passphrase_in_memory()) {
        fetch_folders();
        fetch_counts();
      }
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, counts_handler);
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, folders_handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, counts_handler);
      window.removeEventListener(MAIL_EVENTS.FOLDERS_CHANGED, folders_handler);
    };
  }, [fetch_counts, fetch_folders]);

  return {
    state,
    counts,
    fetch_folders,
    fetch_counts,
    create_new_folder,
    update_existing_folder,
    delete_existing_folder,
    toggle_folder_lock,
    add_folder_to_email,
    remove_folder_from_email,
    get_folder_by_token,
    get_folder_by_id,
    refresh,
  };
}

export type { FolderCounts, FoldersState };

export { encrypt_folder_field, generate_folder_token };
