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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import type {
  SyncSource,
  DecryptedSyncSource,
  CardDAVConfig,
  ImportResult,
  ImportVCardContact,
  ContactFormData,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import {
  get_contacts_encryption_key,
  encrypt_contact_data,
  generate_contact_token,
} from "./contacts";
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";

const HASH_ALG = ["SHA", "256"].join("-");

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

interface ListSyncSourcesResponse {
  items: SyncSource[];
}

export async function list_sync_sources(): Promise<
  ApiResponse<DecryptedSyncSource[]>
> {
  const response = await api_client.get<ListSyncSourcesResponse>(
    "/contacts/v1/sync/sources",
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch sync sources" };
  }

  try {
    const key = await get_contacts_encryption_key();
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const decrypted_config = await decrypt_aes_gcm_with_fallback(key, base64_to_array(item.encrypted_config), base64_to_array(item.config_nonce));

        const config: CardDAVConfig = JSON.parse(
          new TextDecoder().decode(decrypted_config),
        );

        return {
          id: item.id,
          source_type: item.source_type,
          config,
          last_sync_at: item.last_sync_at,
          last_sync_status: item.last_sync_status,
          contacts_synced: item.contacts_synced,
          is_enabled: item.is_enabled,
          created_at: item.created_at,
        };
      }),
    );

    return { data: items };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt sync sources",
    };
  }
}

export async function add_carddav_sync_source(
  config: CardDAVConfig,
): Promise<ApiResponse<DecryptedSyncSource>> {
  const key = await get_contacts_encryption_key();
  const config_json = JSON.stringify(config);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_config = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(config_json),
  );

  const response = await api_client.post<SyncSource>(
    "/contacts/v1/sync/sources",
    {
      source_type: "carddav",
      encrypted_config: array_to_base64(new Uint8Array(encrypted_config)),
      config_nonce: array_to_base64(nonce),
    },
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to add sync source" };
  }

  return {
    data: {
      id: response.data.id,
      source_type: response.data.source_type,
      config,
      last_sync_at: response.data.last_sync_at,
      last_sync_status: response.data.last_sync_status,
      contacts_synced: response.data.contacts_synced,
      is_enabled: response.data.is_enabled,
      created_at: response.data.created_at,
    },
  };
}

export async function delete_sync_source(
  source_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/v1/sync/sources/${source_id}`,
  );
}

export async function toggle_sync_source(
  source_id: string,
): Promise<ApiResponse<SyncSource>> {
  return api_client.post<SyncSource>(
    `/contacts/v1/sync/sources/${source_id}/toggle`,
    {},
  );
}

export async function trigger_sync(
  source_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/contacts/v1/sync/sources/${source_id}/sync`,
    {},
  );
}

function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

async function generate_search_token(value: string): Promise<string> {
  await get_contacts_encryption_key();
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("contacts-search-v2");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  secure_zero_memory(combined);
  secure_zero_memory(raw_key);

  const search_key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );

  const normalized = value.toLowerCase().trim();
  const data = encoder.encode(normalized);
  const signature = await crypto.subtle.sign("HMAC", search_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function import_vcard(
  vcard_data: string,
  parsed_contacts: ContactFormData[],
): Promise<ApiResponse<ImportResult>> {
  const contacts: ImportVCardContact[] = await Promise.all(
    parsed_contacts.map(async (contact) => {
      const contact_token = await generate_contact_token(contact);
      const { encrypted_data, data_nonce } =
        await encrypt_contact_data(contact);

      const full_name = `${contact.first_name} ${contact.last_name}`.trim();
      const name_search_token = full_name
        ? await generate_search_token(full_name)
        : undefined;
      const email_search_token =
        contact.emails.length > 0
          ? await generate_search_token(contact.emails[0])
          : undefined;

      return {
        contact_token,
        encrypted_data,
        data_nonce,
        name_search_token,
        email_search_token,
      };
    }),
  );

  return api_client.post<ImportResult>("/contacts/v1/import/vcard", {
    vcard_data,
    contacts,
  });
}

export async function import_csv(
  parsed_contacts: ContactFormData[],
): Promise<ApiResponse<ImportResult>> {
  const contacts: ImportVCardContact[] = await Promise.all(
    parsed_contacts.map(async (contact) => {
      const contact_token = await generate_contact_token(contact);
      const { encrypted_data, data_nonce } =
        await encrypt_contact_data(contact);

      const full_name = `${contact.first_name} ${contact.last_name}`.trim();
      const name_search_token = full_name
        ? await generate_search_token(full_name)
        : undefined;
      const email_search_token =
        contact.emails.length > 0
          ? await generate_search_token(contact.emails[0])
          : undefined;

      return {
        contact_token,
        encrypted_data,
        data_nonce,
        name_search_token,
        email_search_token,
      };
    }),
  );

  return api_client.post<ImportResult>("/contacts/v1/import/csv", {
    contacts,
  });
}

interface ExportResponse {
  vcard_data: string;
  contact_count: number;
}

export async function export_vcard(): Promise<ApiResponse<ExportResponse>> {
  return api_client.get<ExportResponse>("/contacts/v1/export/vcard");
}

export async function export_csv(): Promise<ApiResponse<ExportResponse>> {
  return api_client.get<ExportResponse>("/contacts/v1/export/csv");
}

export function parse_vcard(vcard_data: string): ContactFormData[] {
  const contacts: ContactFormData[] = [];
  const vcards = vcard_data.split(/(?=BEGIN:VCARD)/i).filter(Boolean);

  for (const vcard of vcards) {
    const lines = vcard.split(/\r?\n/);
    const contact: ContactFormData = {
      first_name: "",
      last_name: "",
      emails: [],
      is_favorite: false,
    };

    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      const value = rest.join(":");

      if (!key || !value) continue;

      const key_upper = key.toUpperCase().split(";")[0];

      switch (key_upper) {
        case "FN": {
          const parts = value.split(" ");

          contact.first_name = parts[0] || "";
          contact.last_name = parts.slice(1).join(" ") || "";
          break;
        }
        case "N": {
          const [last, first] = value.split(";");

          if (first) contact.first_name = first;
          if (last) contact.last_name = last;
          break;
        }
        case "EMAIL":
          contact.emails.push(value);
          break;
        case "TEL":
          contact.phone = value;
          break;
        case "ORG":
          contact.company = value.split(";")[0];
          break;
        case "TITLE":
          contact.job_title = value;
          break;
        case "BDAY":
          contact.birthday = value;
          break;
        case "NOTE":
          contact.notes = value;
          break;
        case "URL":
          contact.social_links = { ...contact.social_links, website: value };
          break;
      }
    }

    if (contact.first_name || contact.last_name || contact.emails.length > 0) {
      contacts.push(contact);
    }
  }

  return contacts;
}

export function parse_csv(
  csv_data: string,
  field_mapping: Record<string, keyof ContactFormData | null>,
): ContactFormData[] {
  const lines = csv_data.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const contacts: ContactFormData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]
      .split(",")
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const contact: ContactFormData = {
      first_name: "",
      last_name: "",
      emails: [],
      is_favorite: false,
    };

    headers.forEach((header, idx) => {
      const field = field_mapping[header];
      const value = values[idx];

      if (!field || !value) return;

      if (field === "emails") {
        contact.emails.push(value);
      } else if (field === "first_name" || field === "last_name") {
        contact[field] = value;
      } else if (
        field === "phone" ||
        field === "company" ||
        field === "job_title" ||
        field === "birthday" ||
        field === "notes"
      ) {
        contact[field] = value;
      }
    });

    if (contact.first_name || contact.last_name || contact.emails.length > 0) {
      contacts.push(contact);
    }
  }

  return contacts;
}
