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
import type {
  SyncSource,
  DecryptedSyncSource,
  CardDAVConfig,
  ImportResult,
  ImportVCardContact,
  ContactFormData,
  Address,
  SocialLinks,
  EmailEntryType,
  AddressEntryType,
  EmailEntry,
  PhoneEntry,
  PhoneEntryType,
  AddressEntry,
  DateEntry,
  DateEntryType,
  RelatedPersonEntry,
  RelatedPersonType,
  SocialNetworkEntry,
  SocialNetworkType,
  WebsiteEntry,
  WebsiteType,
  InstantMessengerEntry,
  InstantMessengerType,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import {
  get_contacts_encryption_key,
  encrypt_contact_data,
  generate_contact_token,
} from "./contacts";

import { user_facing_error } from "@/utils/user_facing_error";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
import { parse_csv_records } from "@/utils/contact_utils";
import { get_active_translations } from "@/lib/i18n/translations";

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
    return {
      error: response.error || get_active_translations().errors.load_failed,
    };
  }

  const key = await get_contacts_encryption_key();
  const settled = await Promise.allSettled(
    response.data.items.map(async (item): Promise<DecryptedSyncSource> => {
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

  const items = settled
    .filter(
      (result): result is PromiseFulfilledResult<DecryptedSyncSource> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  const failed = settled.filter((result) => result.status === "rejected");

  if (items.length === 0 && failed.length > 0) {
    const first = failed[0] as PromiseRejectedResult;

    return {
      error: user_facing_error(
        first.reason,
        get_active_translations().errors.load_failed,
      ),
    };
  }

  return { data: items, details: { failed_count: failed.length } };
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
    return {
      error: response.error || get_active_translations().common.save_failed,
    };
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
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
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

const IMPORT_TIMEOUT_MS = 120000;

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

  return api_client.post<ImportResult>(
    "/contacts/v1/import/csv",
    { contacts },
    { timeout: IMPORT_TIMEOUT_MS },
  );
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

function split_vcard_list(value: string): string[] {
  const parts: string[] = [];
  let current = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === "\\" && i + 1 < value.length) {
      current += char + value[i + 1];
      i++;
      continue;
    }
    if (char === ",") {
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

function photo_source_from(key: string, value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) return undefined;
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;

  const raw_params = key.split(";").slice(1);
  const is_base64 = raw_params.some((param) =>
    /^(encoding=(b|base64)|base64)$/i.test(param.trim()),
  );

  if (!is_base64) return undefined;

  const type_param = raw_params.find((param) => /^type=/i.test(param.trim()));
  const media = (type_param ? type_param.split("=")[1] : "jpeg")
    .replace(/"/g, "")
    .trim()
    .toLowerCase();
  const subtype = media.includes("/") ? media.split("/")[1] : media;

  return `data:image/${subtype || "jpeg"};base64,${trimmed.replace(/\s+/g, "")}`;
}

const VCARD_DATE_TYPES: Record<string, DateEntryType> = {
  anniversary: "anniversary",
  graduation: "graduation",
  wedding: "wedding",
};

const VCARD_RELATION_TYPES: Record<string, RelatedPersonType> = {
  assistant: "assistant",
  manager: "manager",
  supervisor: "manager",
  spouse: "spouse",
  partner: "partner",
  child: "child",
  parent: "parent",
  father: "parent",
  mother: "parent",
  sibling: "sibling",
  brother: "sibling",
  sister: "sibling",
  friend: "friend",
};

const VCARD_SOCIAL_TYPES: Record<string, SocialNetworkType> = {
  twitter: "twitter",
  x: "twitter",
  linkedin: "linkedin",
  github: "github",
  instagram: "instagram",
  facebook: "facebook",
  mastodon: "mastodon",
  bluesky: "bluesky",
};

const VCARD_MESSENGER_TYPES: Record<string, InstantMessengerType> = {
  signal: "signal",
  matrix: "matrix",
  telegram: "telegram",
  tg: "telegram",
  whatsapp: "whatsapp",
  xmpp: "xmpp",
  jabber: "xmpp",
};

const VCARD_WEBSITE_TYPES: Record<string, WebsiteType> = {
  home: "private",
  private: "private",
  personal: "private",
  work: "work",
  blog: "blog",
};

function raw_param_value(key: string, name: string): string {
  const match = key
    .split(";")
    .slice(1)
    .find((param) => param.trim().toLowerCase().startsWith(`${name}=`));

  if (!match) return "";

  return match
    .slice(match.indexOf("=") + 1)
    .replace(/"/g, "")
    .trim();
}

function mapped_type<T>(
  table: Record<string, T>,
  candidates: string[],
  fallback: T,
): T {
  for (const candidate of candidates) {
    const mapped = table[candidate.trim().toLowerCase()];

    if (mapped) return mapped;
  }

  return fallback;
}

function messenger_from(key: string, value: string): InstantMessengerEntry {
  const scheme = value.includes(":") ? value.slice(0, value.indexOf(":")) : "";
  const handle = scheme ? value.slice(scheme.length + 1) : value;
  const type = mapped_type(
    VCARD_MESSENGER_TYPES,
    [raw_param_value(key, "x-service-type"), scheme, ...vcard_params(key)],
    "other",
  );

  return { value: handle.trim() || value.trim(), type };
}

function place_type_from(params: string[]): "home" | "work" | "other" {
  if (params.includes("home")) return "home";
  if (params.includes("work")) return "work";

  return "other";
}

export function parse_vcard(vcard_data: string): ContactFormData[] {
  const contacts: ContactFormData[] = [];
  const text =
    vcard_data.charCodeAt(0) === 0xfeff ? vcard_data.slice(1) : vcard_data;
  const vcards = text.split(/(?=BEGIN:VCARD)/i).filter(Boolean);

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
    const date_entries: DateEntry[] = [];
    const related_people: RelatedPersonEntry[] = [];
    const social_networks: SocialNetworkEntry[] = [];
    const websites: WebsiteEntry[] = [];
    const instant_messengers: InstantMessengerEntry[] = [];
    const groups: string[] = [];
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
          const [last, first, middle, prefix, suffix] =
            split_vcard_value(value);

          if (first) contact.first_name = first;
          if (last) contact.last_name = last;
          if (middle) contact.middle_name = middle;
          if (prefix) contact.title = prefix;
          if (suffix) contact.name_suffix = suffix;
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
        case "ORG": {
          const org_parts = split_vcard_value(value);

          contact.company = org_parts[0];
          if (org_parts[1]) contact.department = org_parts[1];
          break;
        }
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
        case "URL": {
          const url = text.trim();

          if (!url) break;
          if (!contact.social_links?.website) {
            contact.social_links = { ...contact.social_links, website: url };
          }
          websites.push({
            value: url,
            type: mapped_type(VCARD_WEBSITE_TYPES, params, "other"),
          });
          break;
        }
        case "IMPP": {
          const entry = messenger_from(key, text.trim());

          if (entry.value) instant_messengers.push(entry);
          break;
        }
        case "X-SOCIALPROFILE": {
          const handle = text.trim();

          if (!handle) break;
          const type = mapped_type(
            VCARD_SOCIAL_TYPES,
            [raw_param_value(key, "x-user"), ...params],
            "other",
          );

          social_networks.push({ value: handle, type });
          if (type === "linkedin" || type === "twitter" || type === "github") {
            contact.social_links = { ...contact.social_links, [type]: handle };
          }
          break;
        }
        case "CATEGORIES": {
          for (const label of split_vcard_list(value)) {
            const trimmed = label.trim();

            if (trimmed && !groups.includes(trimmed)) groups.push(trimmed);
          }
          break;
        }
        case "RELATED":
        case "X-ABRELATEDNAMES": {
          const person = text.trim();

          if (!person) break;
          related_people.push({
            value: person,
            type: mapped_type(VCARD_RELATION_TYPES, params, "other"),
          });
          break;
        }
        case "ANNIVERSARY": {
          const date = text.trim();

          if (date) date_entries.push({ value: date, type: "anniversary" });
          break;
        }
        case "X-ABDATE": {
          const date = text.trim();

          if (!date) break;
          date_entries.push({
            value: date,
            type: mapped_type(VCARD_DATE_TYPES, params, "other"),
          });
          break;
        }
        case "X-PHONETIC-FIRST-NAME":
          contact.phonetic_first_name = text;
          break;
        case "X-PHONETIC-MIDDLE-NAME":
          contact.phonetic_middle_name = text;
          break;
        case "X-PHONETIC-LAST-NAME":
          contact.phonetic_last_name = text;
          break;
        case "X-PRONOUNS":
          contact.pronouns = text;
          break;
        case "X-ASTER-COMMENT":
          contact.comment = text;
          break;
        case "X-ASTER-RELATIONSHIP": {
          const relationship = text.trim().toLowerCase();

          if (
            relationship === "work" ||
            relationship === "personal" ||
            relationship === "family" ||
            relationship === "other"
          ) {
            contact.relationship = relationship;
          }
          break;
        }
        case "X-ASTER-FAVORITE":
          contact.is_favorite = /^(1|true|yes)$/i.test(text.trim());
          break;
        case "X-ASTER-COLOR": {
          const color = text.trim();

          if (/^#[0-9a-f]{6}$/i.test(color)) contact.profile_color = color;
          break;
        }
        case "PHOTO": {
          const photo = photo_source_from(key, value);

          if (photo) contact.avatar_url = photo;
          break;
        }
      }
    }

    if (email_entries.length) contact.email_entries = email_entries;
    if (phone_entries.length) contact.phone_entries = phone_entries;
    if (address_entries.length) contact.address_entries = address_entries;
    if (date_entries.length) contact.date_entries = date_entries;
    if (related_people.length) contact.related_people = related_people;
    if (social_networks.length) contact.social_networks = social_networks;
    if (websites.length) contact.websites = websites;
    if (instant_messengers.length) {
      contact.instant_messengers = instant_messengers;
    }
    if (groups.length) contact.groups = groups;

    if (contact.first_name || contact.last_name || contact.emails.length > 0) {
      contacts.push(contact);
    }
  }

  return contacts;
}

export type CsvFieldTarget =
  | "full_name"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "name_prefix"
  | "name_suffix"
  | "nickname"
  | "emails"
  | "phone"
  | "company"
  | "job_title"
  | "department"
  | "street"
  | "city"
  | "state"
  | "postal_code"
  | "country"
  | "website"
  | "birthday"
  | "event"
  | "related_person"
  | "instant_messenger"
  | "notes"
  | "groups"
  | "is_favorite";

export type CsvColumnPart =
  "value" | "label" | "service" | "formatted" | "extended";

export interface CsvColumn {
  target: CsvFieldTarget | null;
  key: string;
  part: CsvColumnPart;
  implied_type?: string;
}

const ADDRESS_PART_TARGETS: Record<string, CsvFieldTarget | null> = {
  street: "street",
  "street 2": null,
  "street 3": null,
  address: "street",
  city: "city",
  state: "state",
  province: "state",
  region: "state",
  "postal code": "postal_code",
  zip: "postal_code",
  "zip code": "postal_code",
  postcode: "postal_code",
  country: "country",
  "country/region": "country",
};

const ADDRESS_PART_KINDS: Record<string, CsvColumnPart> = {
  "street 2": "extended",
  "street 3": "extended",
  "po box": "extended",
  "address po box": "extended",
  address: "formatted",
  "extended address": "extended",
  formatted: "formatted",
  label: "label",
  type: "label",
};

const PHONE_KIND_WORDS: Record<string, string> = {
  home: "home",
  business: "work",
  work: "work",
  company: "work",
  "company main": "work",
  "assistant's": "work",
  mobile: "mobile",
  cell: "mobile",
  car: "mobile",
  other: "other",
  primary: "other",
  radio: "other",
  callback: "other",
  telex: "other",
  "tty/tdd": "other",
  isdn: "other",
};

const PLACE_WORDS: Record<string, string> = {
  home: "home",
  personal: "home",
  business: "work",
  work: "work",
  other: "other",
};

const SIMPLE_HEADERS: Record<string, CsvFieldTarget> = {
  "first name": "first_name",
  "given name": "first_name",
  first: "first_name",
  given: "first_name",
  "middle name": "middle_name",
  "additional name": "middle_name",
  middle: "middle_name",
  "last name": "last_name",
  "family name": "last_name",
  surname: "last_name",
  last: "last_name",
  "name prefix": "name_prefix",
  prefix: "name_prefix",
  "honorific prefix": "name_prefix",
  salutation: "name_prefix",
  "name suffix": "name_suffix",
  suffix: "name_suffix",
  "honorific suffix": "name_suffix",
  nickname: "nickname",
  "nick name": "nickname",
  "short name": "nickname",
  name: "full_name",
  "full name": "full_name",
  "display name": "full_name",
  "contact name": "full_name",
  email: "emails",
  "e-mail": "emails",
  "email address": "emails",
  "e-mail address": "emails",
  mail: "emails",
  emails: "emails",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  "phone number": "phone",
  "primary phone": "phone",
  mobile: "phone",
  "mobile phone": "phone",
  "mobile number": "phone",
  cell: "phone",
  "cell phone": "phone",
  pager: "phone",
  fax: "phone",
  "fax number": "phone",
  company: "company",
  "company name": "company",
  organization: "company",
  organisation: "company",
  "organization name": "company",
  "job title": "job_title",
  title: "job_title",
  position: "job_title",
  role: "job_title",
  occupation: "job_title",
  profession: "job_title",
  department: "department",
  street: "street",
  "street address": "street",
  address: "street",
  "address line 1": "street",
  "address 1": "street",
  city: "city",
  town: "city",
  locality: "city",
  state: "state",
  region: "state",
  province: "state",
  county: "state",
  "postal code": "postal_code",
  zip: "postal_code",
  "zip code": "postal_code",
  postcode: "postal_code",
  country: "country",
  "country/region": "country",
  website: "website",
  "web page": "website",
  "web site": "website",
  url: "website",
  homepage: "website",
  "home page": "website",
  "personal web page": "website",
  "business web page": "website",
  birthday: "birthday",
  "birth date": "birthday",
  "date of birth": "birthday",
  dob: "birthday",
  anniversary: "event",
  spouse: "related_person",
  partner: "related_person",
  "manager's name": "related_person",
  manager: "related_person",
  "assistant's name": "related_person",
  assistant: "related_person",
  children: "related_person",
  child: "related_person",
  "im address": "instant_messenger",
  imaddress: "instant_messenger",
  im: "instant_messenger",
  "instant messenger": "instant_messenger",
  notes: "notes",
  note: "notes",
  comment: "notes",
  comments: "notes",
  description: "notes",
  "group membership": "groups",
  labels: "groups",
  categories: "groups",
  groups: "groups",
  group: "groups",
  tags: "groups",
  favorite: "is_favorite",
  favourite: "is_favorite",
  starred: "is_favorite",
  "is favorite": "is_favorite",
};

const IMPLIED_TYPES: Record<string, string> = {
  mobile: "mobile",
  "mobile phone": "mobile",
  "mobile number": "mobile",
  cell: "mobile",
  "cell phone": "mobile",
  pager: "pager",
  fax: "fax",
  "fax number": "fax",
  anniversary: "anniversary",
  spouse: "spouse",
  partner: "partner",
  "manager's name": "manager",
  manager: "manager",
  "assistant's name": "assistant",
  assistant: "assistant",
  children: "child",
  child: "child",
  "personal web page": "private",
  "home page": "private",
  homepage: "private",
  "business web page": "work",
};

const ORG_PART_TARGETS: Record<string, CsvFieldTarget> = {
  name: "company",
  title: "job_title",
  department: "department",
};

function normalize_csv_header(header: string): string {
  return header.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function part_of(word: string): CsvColumnPart {
  return word === "value" ? "value" : "label";
}

export function describe_csv_column(header: string): CsvColumn {
  const lower = normalize_csv_header(header);

  if (!lower) return { target: null, key: "", part: "value" };

  let match = lower.match(/^e-?mail (\d+) - (value|label|type)$/);

  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "emails" : null,
      key: `email:${match[1]}`,
      part,
    };
  }

  match = lower.match(/^e-?mail(?: (\d+))?(?: address)?$/);
  if (match && match[1]) {
    return { target: "emails", key: `email:${match[1]}`, part: "value" };
  }

  match = lower.match(/^e-?mail(?: (\d+))? (display name|type)$/);
  if (match) return { target: null, key: "", part: "value" };

  match = lower.match(
    /^(home|business|work|other|personal) (e-?mail|email address|e-mail address)(?: (\d+))?$/,
  );
  if (match) {
    return {
      target: "emails",
      key: `email:${match[1]}:${match[3] ?? "1"}`,
      part: "value",
      implied_type: PLACE_WORDS[match[1]],
    };
  }

  match = lower.match(/^phone (\d+) - (value|label|type)$/);
  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "phone" : null,
      key: `phone:${match[1]}`,
      part,
    };
  }

  match = lower.match(
    /^(home|business|work|company|company main|assistant's|mobile|cell|car|other|primary|radio|callback|telex|tty\/tdd|isdn) (phone|fax|telephone)(?: (\d+))?$/,
  );
  if (match) {
    return {
      target: "phone",
      key: `phone:${match[1]} ${match[2]}:${match[3] ?? "1"}`,
      part: "value",
      implied_type: match[2] === "fax" ? "fax" : PHONE_KIND_WORDS[match[1]],
    };
  }

  match = lower.match(/^address (\d+) - (.+)$/);
  if (match) {
    const kind = ADDRESS_PART_KINDS[match[2]];

    if (kind) return { target: null, key: `address:${match[1]}`, part: kind };

    const target = ADDRESS_PART_TARGETS[match[2]];

    if (target === undefined) return { target: null, key: "", part: "value" };

    return { target, key: `address:${match[1]}`, part: "value" };
  }

  match = lower.match(/^(home|business|work|other) (.+)$/);
  if (match && match[2] in ADDRESS_PART_TARGETS) {
    const kind = ADDRESS_PART_KINDS[match[2]];
    const key = `address:${PLACE_WORDS[match[1]]}`;

    if (kind) return { target: null, key, part: kind };

    return {
      target: ADDRESS_PART_TARGETS[match[2]],
      key,
      part: "value",
      implied_type: PLACE_WORDS[match[1]],
    };
  }

  match = lower.match(/^(address line 2|address 2|street 2|street 3)$/);
  if (match) return { target: null, key: "address:1", part: "extended" };

  match = lower.match(/^organization(?: (\d+))? - (.+)$/);
  if (match) {
    const target = ORG_PART_TARGETS[match[2]];

    return {
      target: target ?? null,
      key: `org:${match[1] ?? "1"}`,
      part: "value",
    };
  }

  match = lower.match(/^organization (name|title|department)$/);
  if (match) {
    return { target: ORG_PART_TARGETS[match[1]], key: "org:1", part: "value" };
  }

  match = lower.match(/^website (\d+) - (value|label|type)$/);
  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "website" : null,
      key: `website:${match[1]}`,
      part,
    };
  }

  match = lower.match(/^event (\d+) - (value|label|type)$/);
  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "event" : null,
      key: `event:${match[1]}`,
      part,
    };
  }

  match = lower.match(/^relation (\d+) - (value|label|type)$/);
  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "related_person" : null,
      key: `relation:${match[1]}`,
      part,
    };
  }

  match = lower.match(/^im (\d+) - (value|label|type|service)$/);
  if (match) {
    const part =
      match[2] === "value"
        ? "value"
        : match[2] === "service"
          ? "service"
          : "label";

    return {
      target: part === "value" ? "instant_messenger" : null,
      key: `im:${match[1]}`,
      part,
    };
  }

  match = lower.match(/^custom field (\d+) - (value|label|type)$/);
  if (match) {
    const part = part_of(match[2]);

    return {
      target: part === "value" ? "notes" : null,
      key: `custom:${match[1]}`,
      part,
    };
  }

  const simple = SIMPLE_HEADERS[lower];

  if (!simple) return { target: null, key: "", part: "value" };

  const implied_type = IMPLIED_TYPES[lower];
  const key = ["street", "city", "state", "postal_code", "country"].includes(
    simple,
  )
    ? "address:1"
    : `${simple}:${lower}`;

  return implied_type
    ? { target: simple, key, part: "value", implied_type }
    : { target: simple, key, part: "value" };
}

export function auto_map_csv_headers(
  headers: string[],
): Record<string, CsvFieldTarget | null> {
  const columns = headers.map((header) => describe_csv_column(header));
  const normalized = headers.map((header) => normalize_csv_header(header));
  const has_other_job_title = columns.some(
    (column, index) =>
      column.target === "job_title" && normalized[index] !== "title",
  );
  const has_name_suffix = columns.some(
    (column) => column.target === "name_suffix",
  );
  const mapping: Record<string, CsvFieldTarget | null> = {};

  headers.forEach((header, index) => {
    let target = columns[index].target;

    if (
      normalized[index] === "title" &&
      (has_other_job_title || has_name_suffix)
    ) {
      target = "name_prefix";
    }

    mapping[header] = target;
  });

  return mapping;
}

export function auto_map_csv_header(header: string): CsvFieldTarget | null {
  return auto_map_csv_headers([header])[header] ?? null;
}

const strip_csv_guard = (value: string): string =>
  value.startsWith("'") ? value.slice(1) : value;

const MULTI_VALUE_SEPARATOR = " ::: ";

function split_multi_values(value: string, extra: RegExp | null): string[] {
  const out: string[] = [];

  for (const piece of value.split(MULTI_VALUE_SEPARATOR)) {
    const parts = extra ? piece.split(extra) : [piece];

    for (const part of parts) {
      const trimmed = part.trim();

      if (trimmed) out.push(trimmed);
    }
  }

  return out;
}

const SPLIT_LIST = /[;,]/;
const SPLIT_SEMICOLON = /;/;

function clean_label(label: string | undefined): string {
  return (label ?? "")
    .replace(/^\*\s*/, "")
    .trim()
    .toLowerCase();
}

function email_type_of(label: string): EmailEntryType {
  if (label.includes("work") || label.includes("business")) return "work";
  if (label.includes("home") || label.includes("personal")) return "home";

  return "other";
}

function phone_type_of(label: string): PhoneEntryType {
  if (label.includes("fax")) return "fax";
  if (label.includes("pager")) return "pager";
  if (
    label.includes("mobile") ||
    label.includes("cell") ||
    label.includes("iphone")
  ) {
    return "mobile";
  }
  if (label.includes("work") || label.includes("business")) return "work";
  if (label.includes("home")) return "home";

  return "other";
}

function place_type_of(label: string): AddressEntryType {
  if (label.includes("work") || label.includes("business")) return "work";
  if (label.includes("home") || label.includes("personal")) return "home";

  return "other";
}

function website_type_of(label: string): WebsiteType {
  return mapped_type(
    VCARD_WEBSITE_TYPES,
    [label, label.split(" ")[0]],
    "other",
  );
}

function clean_email(value: string): string {
  const stripped = value.replace(/^mailto:/i, "").trim();
  const angled = stripped.match(/<([^>]+)>/);

  return (angled ? angled[1] : stripped).trim();
}

function split_full_name(full_name: string): [string, string] {
  const trimmed = full_name.trim().replace(/\s+/g, " ");
  const separator = trimmed.lastIndexOf(" ");

  if (separator <= 0) return [trimmed, ""];

  return [trimmed.slice(0, separator), trimmed.slice(separator + 1)];
}

interface CsvSlot {
  values: string[];
  label?: string;
  service?: string;
  implied_type?: string;
}

interface CsvAddressSlot {
  label?: string;
  implied_type?: string;
  street?: string;
  extended?: string;
  formatted?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

function slot_for(map: Map<string, CsvSlot>, key: string): CsvSlot {
  let slot = map.get(key);

  if (!slot) {
    slot = { values: [] };
    map.set(key, slot);
  }

  return slot;
}

const social_hosts: Record<string, keyof SocialLinks> = {
  "linkedin.com": "linkedin",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "github.com": "github",
};

function social_host_of(url: string): keyof SocialLinks | null {
  const trimmed = url.trim();
  const with_scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let host: string;

  try {
    host = new URL(with_scheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  for (const [domain, network] of Object.entries(social_hosts)) {
    if (host === domain || host.endsWith(`.${domain}`)) return network;
  }

  return null;
}

export function parse_csv(
  csv_data: string,
  field_mapping: Record<string, CsvFieldTarget | null>,
): ContactFormData[] {
  const records = parse_csv_records(csv_data);

  if (records.length < 2) return [];

  const headers = records[0];
  const columns = headers.map((header) => describe_csv_column(header));
  const contacts: ContactFormData[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    const contact: ContactFormData = {
      first_name: "",
      last_name: "",
      emails: [],
      is_favorite: false,
    };
    const emails = new Map<string, CsvSlot>();
    const phones = new Map<string, CsvSlot>();
    const websites = new Map<string, CsvSlot>();
    const events = new Map<string, CsvSlot>();
    const relations = new Map<string, CsvSlot>();
    const messengers = new Map<string, CsvSlot>();
    const custom_fields = new Map<string, CsvSlot>();
    const addresses = new Map<string, CsvAddressSlot>();
    const notes: string[] = [];
    const groups: string[] = [];
    let full_name = "";

    const address_for = (key: string, implied_type?: string) => {
      let slot = addresses.get(key);

      if (!slot) {
        slot = { implied_type };
        addresses.set(key, slot);
      }

      return slot;
    };

    headers.forEach((header, idx) => {
      const raw = values[idx];

      if (!raw) return;

      const value = strip_csv_guard(raw).trim();

      if (!value) return;

      const column = columns[idx];
      const mapped = field_mapping[header];

      if (column.part !== "value" && column.key) {
        const [kind] = column.key.split(":");

        if (kind === "address") {
          const slot = address_for(column.key);

          if (column.part === "label") slot.label = value;
          else if (column.part === "extended") slot.extended = value;
          else if (column.part === "formatted") slot.formatted = value;

          return;
        }

        const maps: Record<string, Map<string, CsvSlot>> = {
          email: emails,
          phone: phones,
          website: websites,
          event: events,
          relation: relations,
          im: messengers,
          custom: custom_fields,
        };
        const map = maps[kind];

        if (map) {
          const slot = slot_for(map, column.key);

          if (column.part === "service") slot.service = value;
          else slot.label = value;
        }

        return;
      }

      if (!mapped) return;

      const key = mapped === column.target ? column.key : `${mapped}:${header}`;
      const implied_type =
        mapped === column.target ? column.implied_type : undefined;

      switch (mapped) {
        case "full_name":
          full_name = value;
          break;
        case "first_name":
        case "last_name":
        case "company":
        case "job_title":
        case "birthday":
          if (!contact[mapped]) contact[mapped] = value;
          break;
        case "middle_name":
        case "nickname":
        case "department":
        case "name_suffix":
          if (!contact[mapped]) contact[mapped] = value;
          break;
        case "name_prefix":
          if (!contact.title) contact.title = value;
          break;
        case "emails": {
          const slot = slot_for(emails, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, SPLIT_LIST));
          break;
        }
        case "phone": {
          const slot = slot_for(phones, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, SPLIT_SEMICOLON));
          break;
        }
        case "website": {
          const slot = slot_for(websites, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, SPLIT_SEMICOLON));
          break;
        }
        case "event": {
          const slot = slot_for(events, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, null));
          break;
        }
        case "related_person": {
          const slot = slot_for(relations, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, SPLIT_SEMICOLON));
          break;
        }
        case "instant_messenger": {
          const slot = slot_for(messengers, key);

          slot.implied_type = implied_type;
          slot.values.push(...split_multi_values(value, SPLIT_SEMICOLON));
          break;
        }
        case "street":
        case "city":
        case "state":
        case "postal_code":
        case "country": {
          const slot = address_for(key, implied_type);

          if (!slot[mapped]) slot[mapped] = value;
          break;
        }
        case "notes":
          if (key.startsWith("custom:")) {
            slot_for(custom_fields, key).values.push(value);
          } else {
            notes.push(value);
          }
          break;
        case "groups":
          groups.push(...split_multi_values(value, SPLIT_LIST));
          break;
        case "is_favorite":
          contact.is_favorite = /^(true|yes|y|1|starred)$/i.test(value);
          break;
      }
    });

    if (!contact.first_name && !contact.last_name && full_name) {
      const [first, last] = split_full_name(full_name);

      contact.first_name = first;
      contact.last_name = last;
    }

    const email_entries: EmailEntry[] = [];
    const seen_emails = new Set<string>();

    for (const slot of emails.values()) {
      const type = email_type_of(clean_label(slot.label ?? slot.implied_type));

      for (const raw_email of slot.values) {
        const email = clean_email(raw_email);
        const lower = email.toLowerCase();

        if (!email || seen_emails.has(lower)) continue;
        seen_emails.add(lower);
        contact.emails.push(email);
        email_entries.push({ value: email, type });
      }
    }
    if (email_entries.length > 0) contact.email_entries = email_entries;

    const phone_entries: PhoneEntry[] = [];
    const seen_phones = new Set<string>();

    for (const slot of phones.values()) {
      const type = phone_type_of(clean_label(slot.label ?? slot.implied_type));

      for (const phone of slot.values) {
        const digits = phone.replace(/[^\d+]/g, "");

        if (seen_phones.has(digits || phone)) continue;
        seen_phones.add(digits || phone);
        phone_entries.push({ value: phone, type });
      }
    }
    if (phone_entries.length > 0) {
      contact.phone = phone_entries[0].value;
      contact.phone_entries = phone_entries;
    }

    const address_entries: AddressEntry[] = [];

    for (const slot of addresses.values()) {
      const street = [slot.street, slot.extended]
        .filter((part): part is string => Boolean(part))
        .join(", ");
      const entry: AddressEntry = {
        type: place_type_of(clean_label(slot.label ?? slot.implied_type)),
      };

      if (street) entry.street = street;
      else if (slot.formatted && !slot.city && !slot.postal_code) {
        entry.street = slot.formatted.replace(/\s*\n\s*/g, ", ");
      }
      if (slot.city) entry.city = slot.city;
      if (slot.state) entry.state = slot.state;
      if (slot.postal_code) entry.postal_code = slot.postal_code;
      if (slot.country) entry.country = slot.country;

      if (Object.keys(entry).length > 1) address_entries.push(entry);
    }
    if (address_entries.length > 0) {
      const first = address_entries[0];
      const primary: Address = {};

      if (first.street) primary.street = first.street;
      if (first.city) primary.city = first.city;
      if (first.state) primary.state = first.state;
      if (first.postal_code) primary.postal_code = first.postal_code;
      if (first.country) primary.country = first.country;
      contact.address = primary;
      contact.address_entries = address_entries;
    }

    const website_entries: WebsiteEntry[] = [];
    const social_links: SocialLinks = {};

    for (const slot of websites.values()) {
      const type = website_type_of(
        clean_label(slot.label ?? slot.implied_type),
      );

      for (const url of slot.values) {
        const social = social_host_of(url);

        if (social && !social_links[social]) {
          social_links[social] = url;
          continue;
        }
        if (!social_links.website) social_links.website = url;
        website_entries.push({ value: url, type });
      }
    }
    if (Object.keys(social_links).length > 0)
      contact.social_links = social_links;
    if (website_entries.length > 0) contact.websites = website_entries;

    const date_entries: DateEntry[] = [];

    for (const slot of events.values()) {
      const label = clean_label(slot.label ?? slot.implied_type);

      for (const date of slot.values) {
        if (label === "birthday") {
          if (!contact.birthday) contact.birthday = date;
          continue;
        }
        date_entries.push({
          value: date,
          type: mapped_type(VCARD_DATE_TYPES, [label], "other"),
        });
      }
    }
    if (date_entries.length > 0) contact.date_entries = date_entries;

    const related_people: RelatedPersonEntry[] = [];

    for (const slot of relations.values()) {
      const label = clean_label(slot.label ?? slot.implied_type);

      for (const person of slot.values) {
        related_people.push({
          value: person,
          type: mapped_type(VCARD_RELATION_TYPES, [label], "other"),
        });
      }
    }
    if (related_people.length > 0) contact.related_people = related_people;

    const instant_messengers: InstantMessengerEntry[] = [];

    for (const slot of messengers.values()) {
      const label = clean_label(
        slot.service ?? slot.label ?? slot.implied_type,
      );

      for (const handle of slot.values) {
        instant_messengers.push({
          value: handle,
          type: mapped_type(VCARD_MESSENGER_TYPES, [label], "other"),
        });
      }
    }
    if (instant_messengers.length > 0) {
      contact.instant_messengers = instant_messengers;
    }

    for (const slot of custom_fields.values()) {
      const label = (slot.label ?? "").replace(/^\*\s*/, "").trim();

      for (const value of slot.values) {
        notes.push(label ? `${label}: ${value}` : value);
      }
    }
    if (notes.length > 0) contact.notes = notes.join("\n");

    const group_names: string[] = [];

    for (const raw_group of groups) {
      const name = raw_group.replace(/^\*\s*/, "").trim();
      const lower = name.toLowerCase();

      if (!name || lower === "mycontacts" || lower === "my contacts") continue;
      if (lower === "starred") {
        contact.is_favorite = true;
        continue;
      }
      if (!group_names.some((existing) => existing.toLowerCase() === lower)) {
        group_names.push(name);
      }
    }
    if (group_names.length > 0) contact.groups = group_names;

    if (contact.first_name || contact.last_name || contact.emails.length > 0) {
      contacts.push(contact);
    }
  }

  return contacts;
}
