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
import { user_facing_error } from "@/utils/user_facing_error";
import type {
  SyncSource,
  DecryptedSyncSource,
  CardDAVConfig,
  ImportResult,
  ImportVCardContact,
  ContactFormData,
  EmailEntry,
  PhoneEntry,
  PhoneEntryType,
  AddressEntry,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import {
  get_contacts_encryption_key,
  encrypt_contact_data,
  generate_contact_token,
} from "./contacts";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
import { parse_csv_records } from "@/utils/contact_utils";

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
        const decrypted_config = await decrypt_aes_gcm_with_fallback(
          key,
          base64_to_array(item.encrypted_config),
          base64_to_array(item.config_nonce),
        );

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
      error: user_facing_error(err, "Failed to decrypt sync sources"),
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

  zero_uint8_array(combined);
  zero_uint8_array(raw_key);

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

const VCARD_PHONE_TYPES: Record<string, PhoneEntryType> = {
  cell: "mobile",
  mobile: "mobile",
  home: "home",
  work: "work",
  fax: "fax",
  pager: "pager",
};

function unescape_vcard(value: string): string {
  return value.replace(/\\(.)/g, (_match, char: string) => {
    if (char === "n" || char === "N") return "\n";

    return char;
  });
}

function split_vcard_value(value: string): string[] {
  const parts: string[] = [];
  let current = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === "\\" && i + 1 < value.length) {
      current += char + value[i + 1];
      i++;
      continue;
    }
    if (char === ";") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts.map(unescape_vcard);
}

function vcard_params(key: string): string[] {
  return key
    .split(";")
    .slice(1)
    .flatMap((param) => {
      const [name, raw] = param.split("=");

      if (raw === undefined) return [name];

      return name.toUpperCase() === "TYPE" ? raw.split(",") : [];
    })
    .map((value) => value.replace(/"/g, "").trim().toLowerCase())
    .filter(Boolean);
}

function phone_type_from(params: string[]): PhoneEntryType {
  for (const param of params) {
    const mapped = VCARD_PHONE_TYPES[param];

    if (mapped) return mapped;
  }

  return "other";
}

function place_type_from(params: string[]): "home" | "work" | "other" {
  if (params.includes("home")) return "home";
  if (params.includes("work")) return "work";

  return "other";
}

export function parse_vcard(vcard_data: string): ContactFormData[] {
  const contacts: ContactFormData[] = [];
  const vcards = vcard_data.split(/(?=BEGIN:VCARD)/i).filter(Boolean);

  for (const vcard of vcards) {
    const lines = vcard.split(/\r?\n/).reduce<string[]>((unfolded, line) => {
      if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length) {
        unfolded[unfolded.length - 1] += line.slice(1);
      } else {
        unfolded.push(line);
      }

      return unfolded;
    }, []);
    const contact: ContactFormData = {
      first_name: "",
      last_name: "",
      emails: [],
      is_favorite: false,
    };
    const email_entries: EmailEntry[] = [];
    const phone_entries: PhoneEntry[] = [];
    const address_entries: AddressEntry[] = [];
    const seen_emails = new Set<string>();

    for (const line of lines) {
      const separator = line.indexOf(":");

      if (separator < 0) continue;
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);

      if (!key || !value) continue;

      const key_upper = key.toUpperCase().split(";")[0].split(".").pop() || "";
      const params = vcard_params(key);
      const text = unescape_vcard(value);

      switch (key_upper) {
        case "FN": {
          if (!contact.first_name && !contact.last_name) {
            const parts = text.split(" ");

            contact.first_name = parts[0] || "";
            contact.last_name = parts.slice(1).join(" ") || "";
          }
          break;
        }
        case "N": {
          const [last, first, middle] = split_vcard_value(value);

          if (first) contact.first_name = first;
          if (last) contact.last_name = last;
          if (middle) contact.middle_name = middle;
          break;
        }
        case "NICKNAME":
          contact.nickname = text;
          break;
        case "EMAIL": {
          const address = text.replace(/^mailto:/i, "").trim();
          const normalized = address.toLowerCase();

          if (!address || seen_emails.has(normalized)) break;
          seen_emails.add(normalized);
          contact.emails.push(address);
          email_entries.push({ value: address, type: place_type_from(params) });
          break;
        }
        case "TEL": {
          const number = text.replace(/^tel:/i, "").trim();

          if (!number) break;
          if (!contact.phone) contact.phone = number;
          phone_entries.push({ value: number, type: phone_type_from(params) });
          break;
        }
        case "ADR": {
          const parts = split_vcard_value(value);
          const entry: AddressEntry = {
            street: [parts[1], parts[2]].filter(Boolean).join(" ").trim(),
            city: parts[3] || undefined,
            state: parts[4] || undefined,
            postal_code: parts[5] || undefined,
            country: parts[6] || undefined,
            type: place_type_from(params),
          };

          if (!entry.street) entry.street = undefined;
          if (
            entry.street ||
            entry.city ||
            entry.state ||
            entry.postal_code ||
            entry.country
          ) {
            address_entries.push(entry);
            if (!contact.address) {
              contact.address = {
                street: entry.street,
                city: entry.city,
                state: entry.state,
                postal_code: entry.postal_code,
                country: entry.country,
              };
            }
          }
          break;
        }
        case "ORG":
          contact.company = split_vcard_value(value)[0];
          if (split_vcard_value(value)[1]) {
            contact.department = split_vcard_value(value)[1];
          }
          break;
        case "TITLE":
          contact.job_title = text;
          break;
        case "ROLE":
          contact.role = text;
          break;
        case "BDAY":
          contact.birthday = text;
          break;
        case "NOTE":
          contact.notes = text;
          break;
        case "URL":
          contact.social_links = { ...contact.social_links, website: text };
          break;
      }
    }

    if (email_entries.length) contact.email_entries = email_entries;
    if (phone_entries.length) contact.phone_entries = phone_entries;
    if (address_entries.length) contact.address_entries = address_entries;

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
  const records = parse_csv_records(csv_data);

  if (records.length < 2) return [];

  const headers = records[0];
  const contacts: ContactFormData[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
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
