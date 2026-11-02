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
import {
  answer_port_message,
  to_wire,
  type BridgeDeps,
  type BridgeStorage,
} from "./session_bridge_core";

import {
  get_handoff_sibling_origin,
  is_handoff_connect_message,
} from "@/lib/session_handoff/session_handoff_protocol";

const SESSION_KEY_DB_NAME = "astermail_session_keys";
const SESSION_KEY_STORE = "keys";
const SESSION_KEY_ID = "session_encryption_key";
const IDB_TIMEOUT_MS = 4000;
const ME_TIMEOUT_MS = 4000;
const BRIDGE_LIFETIME_MS = 15000;
const ME_ENDPOINT = "/api/core/v1/auth/me";

const local_storage: BridgeStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  keys() {
    try {
      const result: string[] = [];

      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);

        if (key !== null) result.push(key);
      }

      return result;
    } catch {
      return [];
    }
  },
};

function open_existing_session_key_db(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) {
        db?.close();

        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), IDB_TIMEOUT_MS);

    let request: IDBOpenDBRequest;

    try {
      request = window.indexedDB.open(SESSION_KEY_DB_NAME);
    } catch {
      finish(null);

      return;
    }

    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        request.transaction?.abort();
      }
    };
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSION_KEY_STORE)) {
        db.close();
        finish(null);

        return;
      }
      finish(db);
    };
  });
}

async function load_session_key(): Promise<CryptoKey | null> {
  const db = await open_existing_session_key_db();

  if (!db) return null;

  try {
    return await new Promise<CryptoKey | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), IDB_TIMEOUT_MS);

      try {
        const request = db
          .transaction(SESSION_KEY_STORE, "readonly")
          .objectStore(SESSION_KEY_STORE)
          .get(SESSION_KEY_ID);

        request.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        request.onsuccess = () => {
          clearTimeout(timer);
          const row = request.result as { key?: unknown } | undefined;

          resolve(row && row.key instanceof CryptoKey ? row.key : null);
        };
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  } finally {
    db.close();
  }
}

async function fetch_current_user(): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ME_TIMEOUT_MS);

  try {
    const response = await fetch(ME_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json", "X-Aster-Client": "web" },
      signal: controller.signal,
    });

    if (response.status !== 200) return null;

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

const bridge_deps: BridgeDeps = {
  storage: local_storage,
  now: () => Date.now(),
  load_session_key,
  fetch_current_user,
  decrypt: (key, ciphertext, iv) =>
    window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    ),
};

function start_bridge(): void {
  if (window.parent === window) return;

  const sibling_origin = get_handoff_sibling_origin(window.location.origin);

  if (!sibling_origin) return;

  let connected = false;

  const on_window_message = (event: MessageEvent) => {
    if (connected) return;
    if (event.origin !== sibling_origin) return;
    if (event.source !== window.parent) return;
    if (event.ports.length !== 1) return;
    if (!is_handoff_connect_message(event.data)) return;

    connected = true;
    window.removeEventListener("message", on_window_message);

    const port = event.ports[0];
    let busy = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(lifetime);
      port.onmessage = null;
      port.close();
    };
    const lifetime = setTimeout(close, BRIDGE_LIFETIME_MS);

    port.onmessage = (port_event: MessageEvent) => {
      if (busy || closed) return;
      busy = true;

      answer_port_message(bridge_deps, port_event.data)
        .then((reply) => {
          if (closed) return;
          if (!reply) {
            close();

            return;
          }
          port.postMessage(to_wire(reply));
          if (reply.type === "probe_result" && reply.available) {
            busy = false;

            return;
          }
          close();
        })
        .catch(() => close());
    };
    port.start();
  };

  window.addEventListener("message", on_window_message);
}

start_bridge();
