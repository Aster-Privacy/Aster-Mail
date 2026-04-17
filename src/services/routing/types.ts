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
export type ConnectionMethod = "direct" | "tor" | "tor_snowflake" | "cdn_relay";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ConnectionState {
  method: ConnectionMethod;
  status: ConnectionStatus;
  api_onion_url: string | null;
  mail_onion_url: string | null;
  cdn_relay_url: string | null;
  error_message: string | null;
}

export interface ConnectionInfoResponse {
  api_onion: string | null;
  mail_onion: string | null;
  cdn_relay_urls: string[];
  snowflake_broker: string;
  snowflake_stun: string[];
}

export interface TorFetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export const DEFAULT_CONNECTION_STATE: ConnectionState = {
  method: "direct",
  status: "disconnected",
  api_onion_url: null,
  mail_onion_url: null,
  cdn_relay_url: null,
  error_message: null,
};

export const TOR_TIMEOUT = 60000;
export const TOR_RETRY_COUNT = 1;
export const TOR_RETRY_DELAY = 3000;
