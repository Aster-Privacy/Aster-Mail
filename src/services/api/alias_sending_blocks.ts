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
import { api_client, type ApiResponse } from "./client";

export const ALIAS_SENDING_DISABLED_CODE = "ALIAS_SENDING_DISABLED";

export type SendingBlockKind = "alias" | "domain_address";

export interface SendingBlocks {
  alias_ids: string[];
  domain_address_ids: string[];
}

export interface SendingBlockChange {
  kind: SendingBlockKind;
  id: string;
  sending_disabled: boolean;
}

const EMPTY_BLOCKS: SendingBlocks = { alias_ids: [], domain_address_ids: [] };

let current_blocks: SendingBlocks = EMPTY_BLOCKS;
let blocked_option_ids: Set<string> = new Set();
let load_promise: Promise<SendingBlocks> | null = null;
const listeners = new Set<() => void>();

function to_option_ids(blocks: SendingBlocks): Set<string> {
  return new Set([
    ...blocks.alias_ids,
    ...blocks.domain_address_ids.map((id) => `domain-${id}`),
  ]);
}

function publish(blocks: SendingBlocks): void {
  current_blocks = blocks;
  blocked_option_ids = to_option_ids(blocks);
  listeners.forEach((listener) => listener());
}

export function is_alias_sending_disabled_code(
  server_code: string | undefined,
): boolean {
  return server_code === ALIAS_SENDING_DISABLED_CODE;
}

export function sending_block_change_for_option(
  option_id: string,
  sending_disabled: boolean,
): SendingBlockChange | null {
  if (option_id.startsWith("domain-")) {
    return {
      kind: "domain_address",
      id: option_id.slice("domain-".length),
      sending_disabled,
    };
  }

  if (
    option_id === "primary" ||
    option_id.startsWith("ghost-") ||
    option_id.startsWith("external-") ||
    option_id.startsWith("catch-all-")
  ) {
    return null;
  }

  return { kind: "alias", id: option_id, sending_disabled };
}

export function is_option_sending_disabled(option_id: string): boolean {
  return blocked_option_ids.has(option_id);
}

export function get_sending_blocks_snapshot(): SendingBlocks {
  return current_blocks;
}

export function subscribe_sending_blocks(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function fetch_sending_blocks(): Promise<
  ApiResponse<SendingBlocks>
> {
  return api_client.get<SendingBlocks>("/addresses/v1/aliases/sending-blocks");
}

export function load_sending_blocks(force = false): Promise<SendingBlocks> {
  if (load_promise && !force) return load_promise;

  load_promise = fetch_sending_blocks()
    .then((response) => {
      if (response.data) publish(response.data);

      return current_blocks;
    })
    .catch(() => current_blocks)
    .finally(() => {
      load_promise = null;
    });

  return load_promise;
}

export async function update_sending_blocks(
  changes: SendingBlockChange[],
): Promise<ApiResponse<SendingBlocks>> {
  const response = await api_client.patch<SendingBlocks>(
    "/addresses/v1/aliases/sending-blocks",
    { changes },
  );

  if (response.data) publish(response.data);

  return response;
}

export function reset_sending_blocks(): void {
  load_promise = null;
  publish(EMPTY_BLOCKS);
}
