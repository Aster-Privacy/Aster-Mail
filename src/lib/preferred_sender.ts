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
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

const STORAGE_KEY = "aster_preferred_sender_id";

const DOMAIN_PREFIX = "domain-";

export function sender_id_matches(
  option_id: string,
  preferred_id: string,
): boolean {
  if (option_id === preferred_id) return true;
  if (option_id === DOMAIN_PREFIX + preferred_id) return true;
  if (preferred_id === DOMAIN_PREFIX + option_id) return true;

  return false;
}

type Listener = (id: string | null) => void;

const listeners: Set<Listener> = new Set();

function read_local(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write_local(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    /* ignore */
  }
}

function notify(id: string | null): void {
  listeners.forEach((l) => {
    try {
      l(id);
    } catch {
      /* ignore */
    }
  });
}

export function get_preferred_sender_id(): string | null {
  return read_local();
}

export function set_preferred_sender_id(id: string | null): void {
  const current = read_local();

  write_local(id);
  if (current !== id) notify(id);
  sync_preferred_sender_to_server(id).catch((caught) =>
    ignore_error("lib/preferred_sender:set_preferred_sender_id", caught),
  );
}

export function clear_preferred_sender_local(): void {
  const current = read_local();

  write_local(null);
  if (current !== null) notify(null);
}

export function subscribe_preferred_sender(listener: Listener): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

async function sync_preferred_sender_to_server(
  id: string | null,
): Promise<void> {
  await api_client.put("/settings/v1/preferences/default-sender", {
    sender_id: id,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("astermail:authenticated", () => {
    load_preferred_sender_from_server().catch((caught) =>
      ignore_error(
        "lib/preferred_sender:sync_preferred_sender_to_server",
        caught,
      ),
    );
  });
}

export async function load_preferred_sender_from_server(): Promise<void> {
  try {
    const response = await api_client.get<{ sender_id: string | null }>(
      "/settings/v1/preferences/default-sender",
    );
    const server_id = response.data?.sender_id ?? null;
    const local_id = read_local();

    if (server_id !== null) {
      if (server_id !== local_id) {
        write_local(server_id);
        notify(server_id);
      }

      return;
    }

    if (local_id !== null) {
      await sync_preferred_sender_to_server(local_id).catch((caught) =>
        ignore_error(
          "lib/preferred_sender:load_preferred_sender_from_server",
          caught,
        ),
      );
    }
  } catch {
    /* ignore */
  }
}
