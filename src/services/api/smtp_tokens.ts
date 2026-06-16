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
import {
  compute_address_hash,
  encrypt_address_field,
  decrypt_address_field,
} from "./domains";

const SMTP_TOKENS_BASE = "/developer/v1/smtp-tokens";

export interface SmtpTokenRow {
  id: string;
  selector: string;
  bound_address: string;
  label_encrypted: string | null;
  label_nonce: string | null;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface SmtpToken {
  id: string;
  selector: string;
  name: string;
  bound_address: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ListSmtpTokensResponse {
  tokens: SmtpTokenRow[];
}

export interface SmtpSettings {
  host: string;
  port: number;
  security: string;
  username: string;
  password: string;
}

export interface CreateSmtpTokenRequest {
  name: string;
  from_address: string;
  domain_name: string;
  local_part: string;
  expires_in_days?: number;
}

interface CreateSmtpTokenApiRequest {
  label_encrypted: string;
  label_nonce: string;
  from_address: string;
  from_address_hash: string;
  expires_in_days?: number;
}

export interface CreateSmtpTokenApiResponse {
  id: string;
  selector: string;
  bound_address: string;
  token: string;
  label_encrypted: string;
  label_nonce: string;
  expires_at: string | null;
  created_at: string;
  smtp_settings: SmtpSettings;
}

export interface CreateSmtpTokenResult {
  id: string;
  selector: string;
  name: string;
  bound_address: string;
  token: string;
  expires_at: string | null;
  created_at: string;
  smtp_settings: SmtpSettings;
}

export async function list_smtp_tokens(): Promise<
  ApiResponse<{ tokens: SmtpToken[] }>
> {
  const response = await api_client.get<ListSmtpTokensResponse>(
    SMTP_TOKENS_BASE,
  );

  if (!response.data) {
    return {
      error: response.error,
      code: response.code,
      server_code: response.server_code,
      resets_at: response.resets_at,
    };
  }

  const tokens = await Promise.all(
    response.data.tokens.map(async (row) => {
      let name = "";

      if (row.label_encrypted && row.label_nonce) {
        try {
          name = await decrypt_address_field(
            row.label_encrypted,
            row.label_nonce,
          );
        } catch {
          name = "";
        }
      }

      return {
        id: row.id,
        selector: row.selector,
        name,
        bound_address: row.bound_address,
        is_active: row.is_active,
        last_used_at: row.last_used_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
      };
    }),
  );

  return { data: { tokens } };
}

export async function create_smtp_token(
  request: CreateSmtpTokenRequest,
): Promise<ApiResponse<CreateSmtpTokenResult>> {
  const from_address_hash = await compute_address_hash(
    request.local_part,
    request.domain_name,
  );
  const { encrypted: label_encrypted, nonce: label_nonce } =
    await encrypt_address_field(request.name);

  const api_request: CreateSmtpTokenApiRequest = {
    label_encrypted,
    label_nonce,
    from_address: request.from_address,
    from_address_hash,
  };

  if (request.expires_in_days !== undefined) {
    api_request.expires_in_days = request.expires_in_days;
  }

  const response = await api_client.post<CreateSmtpTokenApiResponse>(
    SMTP_TOKENS_BASE,
    api_request,
  );

  if (!response.data) {
    return {
      error: response.error,
      code: response.code,
      server_code: response.server_code,
      resets_at: response.resets_at,
    };
  }

  return {
    data: {
      id: response.data.id,
      selector: response.data.selector,
      name: request.name,
      bound_address: response.data.bound_address,
      token: response.data.token,
      expires_at: response.data.expires_at,
      created_at: response.data.created_at,
      smtp_settings: response.data.smtp_settings,
    },
  };
}

export async function revoke_smtp_token(
  token_id: string,
): Promise<ApiResponse<void>> {
  return api_client.delete<void>(`${SMTP_TOKENS_BASE}/${token_id}`);
}
