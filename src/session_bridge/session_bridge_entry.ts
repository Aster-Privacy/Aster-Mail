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
  read_local_session,
  to_wire,
  user_from_me_response,
  type BridgeDeps,
  type BridgeStorage,
} from "./session_bridge_core";
import {
  create_approval,
  mount_approval,
  show_approval_message,
  type ApprovalStrings,
} from "./session_bridge_approval";

import {
  CALENDAR_WEB_ORIGIN,
  SESSION_APPROVAL_HASH_PREFIX,
  get_handoff_sibling_origin,
  is_handoff_connect_message,
  is_handoff_grant_id,
  type HandoffUser,
} from "@/lib/session_handoff/session_handoff_protocol";
import {
  HANDOFF_GRANT_WAIT_MS,
  local_grant_storage,
} from "@/lib/session_handoff/session_handoff_grant";
import {
  get_active_language,
  get_translations_async,
} from "@/lib/i18n/translations";

const SESSION_KEY_DB_NAME = "astermail_session_keys";
const SESSION_KEY_STORE = "keys";
const SESSION_KEY_ID = "session_encryption_key";
const IDB_TIMEOUT_MS = 4000;
const ME_TIMEOUT_MS = 4000;
const BRIDGE_LIFETIME_MS = HANDOFF_GRANT_WAIT_MS + 15000;
const ME_ENDPOINT = "/api/core/v1/auth/me";

const local_storage: BridgeStorage = local_grant_storage;

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
      db.onversionchange = () => db.close();
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
      headers: {
        Accept: "application/json",
        "X-Aster-Client": "web",
        "X-Aster-Vault-Level": "2",
      },
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
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  load_session_key,
  fetch_current_user,
  decrypt: (key, ciphertext, iv) =>
    window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    ),
};

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in params ? params[key] : match,
  );
}

async function load_approval_strings(
  audience: string,
  email: string,
): Promise<ApprovalStrings & { signed_out: string }> {
  const language = get_active_language();
  const t = await get_translations_async(language);
  const app =
    audience === CALENDAR_WEB_ORIGIN
      ? t.calendar.aster_calendar
      : t.common.aster_mail;

  document.documentElement.lang = language;

  return {
    title: fill(t.auth.handoff_approve_title, { app }),
    body: fill(t.auth.handoff_approve_body, { app, email }),
    continue_label: t.common.continue,
    cancel_label: t.common.cancel,
    done: t.auth.handoff_approve_done,
    signed_out: t.auth.handoff_approve_signed_out,
  };
}

async function read_signed_in_user(): Promise<HandoffUser | null> {
  let me: unknown = null;

  try {
    me = await fetch_current_user();
  } catch {
    return null;
  }

  const user = user_from_me_response(me);

  if (!user || !read_local_session(local_storage, user.id, Date.now())) {
    return null;
  }

  return user;
}

async function run_approval(
  grant_id: string,
  audience: string,
): Promise<void> {
  window.opener = null;
  window.history.replaceState(null, "", window.location.pathname);

  const user = await read_signed_in_user();
  const strings = await load_approval_strings(audience, user?.email ?? "");
  const approval = create_approval({
    storage: local_storage,
    now: () => Date.now(),
    grant_id,
    audience,
    user_id: user?.id ?? null,
  });
  const close_soon = () => window.setTimeout(() => window.close(), 400);

  window.addEventListener("pagehide", () => {
    if (!approval.is_decided()) approval.deny();
  });

  if (!user) {
    approval.deny();
    show_approval_message(document, window, strings.signed_out);

    return;
  }

  mount_approval(document, window, strings, approval, close_soon);
}

function start_approval(sibling_origin: string): void {
  const hash = window.location.hash;

  if (!hash.startsWith(SESSION_APPROVAL_HASH_PREFIX)) return;

  const grant_id = hash.slice(SESSION_APPROVAL_HASH_PREFIX.length);

  if (!is_handoff_grant_id(grant_id)) return;

  void run_approval(grant_id, sibling_origin);
}

function start_bridge(): void {
  const sibling_origin = get_handoff_sibling_origin(window.location.origin);

  if (!sibling_origin) return;

  if (window.parent === window) {
    start_approval(sibling_origin);

    return;
  }

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

      answer_port_message(bridge_deps, sibling_origin, port_event.data)
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
