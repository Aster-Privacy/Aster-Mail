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
  type ConnectionInfoResponse,
  type ConnectionMethod,
  type ConnectionState,
  type ConnectionStatus,
  DEFAULT_CONNECTION_STATE,
} from "./types";

import { api_client } from "@/services/api/client";

const STORAGE_KEY = "aster_connection_method";
const CDN_RELAY_URL_KEY = "aster_cdn_relay_url";
const ONION_API_KEY = "aster_onion_api_url";
const ONION_MAIL_KEY = "aster_onion_mail_url";

type ConnectionListener = (state: ConnectionState) => void;

class ConnectionStore {
  private state: ConnectionState = { ...DEFAULT_CONNECTION_STATE };
  private listeners: Set<ConnectionListener> = new Set();

  async initialize(): Promise<void> {
    const method = await this.load_persisted_method();
    const cdn_relay_url = await this.load_persisted_value(CDN_RELAY_URL_KEY);
    const api_onion_url = await this.load_persisted_value(ONION_API_KEY);
    const mail_onion_url = await this.load_persisted_value(ONION_MAIL_KEY);

    this.state = {
      ...DEFAULT_CONNECTION_STATE,
      method,
      cdn_relay_url,
      api_onion_url,
      mail_onion_url,
    };

    this.notify_listeners();

    this.sync_from_server().catch(() => {});
    this.fetch_connection_info().catch(() => {});
  }

  async sync_from_server(): Promise<void> {
    try {
      const server_method = await this.load_method_from_server();

      if (server_method && server_method !== this.state.method) {
        this.state.method = server_method;
        this.state.status =
          server_method === "direct" ? "disconnected" : "connecting";
        await this.persist_value(STORAGE_KEY, server_method);
        this.notify_listeners();

        return;
      }

      if (!server_method) {
        await this.sync_method_to_server(this.state.method).catch(() => {});
      }
    } catch {}
  }

  async fetch_connection_info(): Promise<void> {
    const response = await api_client.get<ConnectionInfoResponse>(
      "/core/v1/connection-info",
    );

    if (!response.data) return;

    const cdn_relay_url =
      response.data.cdn_relay_urls.length > 0
        ? response.data.cdn_relay_urls[0]
        : null;

    await this.set_connection_info(
      response.data.api_onion || null,
      response.data.mail_onion || null,
      cdn_relay_url,
    );
  }

  get_state(): ConnectionState {
    return { ...this.state };
  }

  get_method(): ConnectionMethod {
    return this.state.method;
  }

  get_cdn_relay_url(): string | null {
    return this.state.cdn_relay_url;
  }

  get_api_onion_url(): string | null {
    return this.state.api_onion_url;
  }

  async set_method(method: ConnectionMethod): Promise<void> {
    this.state.method = method;
    this.state.status = method === "direct" ? "disconnected" : "connecting";
    this.state.error_message = null;
    await this.persist_value(STORAGE_KEY, method);
    this.notify_listeners();
    this.sync_method_to_server(method).catch(() => {});
  }

  set_status(status: ConnectionStatus, error_message?: string): void {
    this.state.status = status;
    this.state.error_message = error_message || null;
    this.notify_listeners();
  }

  async set_connection_info(
    api_onion_url: string | null,
    mail_onion_url: string | null,
    cdn_relay_url: string | null,
  ): Promise<void> {
    this.state.api_onion_url = api_onion_url;
    this.state.mail_onion_url = mail_onion_url;
    this.state.cdn_relay_url = cdn_relay_url;

    await Promise.all([
      this.persist_value(ONION_API_KEY, api_onion_url || ""),
      this.persist_value(ONION_MAIL_KEY, mail_onion_url || ""),
      this.persist_value(CDN_RELAY_URL_KEY, cdn_relay_url || ""),
    ]);

    this.notify_listeners();
  }

  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  private notify_listeners(): void {
    const snapshot = this.get_state();

    this.listeners.forEach((listener) => listener(snapshot));
  }

  private async sync_method_to_server(method: ConnectionMethod): Promise<void> {
    await api_client.put("/settings/v1/preferences/connection", { method });
  }

  private async load_method_from_server(): Promise<ConnectionMethod | null> {
    const response = await api_client.get<{ method: string | null }>(
      "/settings/v1/preferences/connection",
    );

    const server_method = response.data?.method;

    if (
      server_method === "direct" ||
      server_method === "tor" ||
      server_method === "tor_snowflake" ||
      server_method === "cdn_relay"
    ) {
      return server_method;
    }

    return null;
  }

  private async load_persisted_method(): Promise<ConnectionMethod> {
    const value = await this.load_persisted_value(STORAGE_KEY);

    if (
      value === "direct" ||
      value === "tor" ||
      value === "tor_snowflake" ||
      value === "cdn_relay"
    ) {
      return value;
    }

    return "direct";
  }

  private async load_persisted_value(key: string): Promise<string | null> {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      return null;
    }

    return null;
  }

  private async persist_value(key: string, value: string): Promise<void> {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        if (value) {
          window.localStorage.setItem(key, value);
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      return;
    }
  }
}

export const connection_store = new ConnectionStore();

if (typeof window !== "undefined") {
  window.addEventListener("astermail:authenticated", () => {
    connection_store.sync_from_server().catch(() => {});
  });
}
