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
  Contact,
  ContactFormData,
  ContactsListResponse,
  ListContactsParams,
  CreateContactRequest,
  CreateContactResponse,
  UpdateContactRequest,
  UpdateContactResponse,
  DeleteContactResponse,
  BulkDeleteContactsRequest,
  BulkDeleteContactsResponse,
  SearchContactsResponse,
  DecryptedContact,
  ContactGroup,
  ContactGroupEncrypted,
  ContactGroupFormData,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";

import { CONTACT_DATA_VERSION } from "@/types/contacts";
import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";

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

async function get_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }
  const encoder = new TextEncoder();
  const info = encoder.encode("contacts-hmac-v2");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);
  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign", "verify"],
  );
}

async function get_search_token_key(): Promise<CryptoKey> {
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

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

export async function get_contacts_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

async function generate_search_token(value: string): Promise<string> {
  const search_key = await get_search_token_key();
  const normalized = value.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.sign("HMAC", search_key, data);

  return array_to_base64(new Uint8Array(hash));
}

export async function generate_contact_token(
  form_data: ContactFormData,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const searchable =
    `${form_data.first_name} ${form_data.last_name} ${form_data.emails.join(" ")}`.toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(searchable);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_search_tokens(form_data: ContactFormData): Promise<{
  name_token?: string;
  email_token?: string;
  company_token?: string;
}> {
  const tokens: {
    name_token?: string;
    email_token?: string;
    company_token?: string;
  } = {};

  const full_name = `${form_data.first_name} ${form_data.last_name}`.trim();

  if (full_name) {
    tokens.name_token = await generate_search_token(full_name);
  }

  if (form_data.emails.length > 0 && form_data.emails[0]) {
    tokens.email_token = await generate_search_token(form_data.emails[0]);
  }

  if (form_data.company) {
    tokens.company_token = await generate_search_token(form_data.company);
  }

  return tokens;
}

async function generate_integrity_hash(
  encrypted_data: string,
  nonce: string,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:${CONTACT_DATA_VERSION}`;
  const data = encoder.encode(combined);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function verify_integrity_hash(
  encrypted_data: string,
  nonce: string,
  hash: string,
  version: number,
): Promise<boolean> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:${version}`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return crypto.subtle.verify("HMAC", hmac_key, expected_hash, data);
}

export async function encrypt_contact_data(data: ContactFormData): Promise<{
  encrypted_data: string;
  data_nonce: string;
  integrity_hash: string;
}> {
  const key = await get_contacts_encryption_key();
  const encoder = new TextEncoder();
  const payload = {
    ...data,
    _version: CONTACT_DATA_VERSION,
    _encrypted_at: new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_data = array_to_base64(new Uint8Array(ciphertext));
  const data_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_data,
    data_nonce,
  );

  return { encrypted_data, data_nonce, integrity_hash };
}

export async function decrypt_contact_data(
  encrypted_data: string,
  data_nonce: string,
  integrity_hash?: string,
  data_version?: number,
): Promise<ContactFormData> {
  if (integrity_hash && data_version) {
    const is_valid = await verify_integrity_hash(
      encrypted_data,
      data_nonce,
      integrity_hash,
      data_version,
    );

    if (!is_valid) {
      throw new Error("Contact data integrity check failed");
    }
  }

  const key = await get_contacts_encryption_key();
  const ciphertext = base64_to_array(encrypted_data);
  const nonce = base64_to_array(data_nonce);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  delete parsed._version;
  delete parsed._encrypted_at;

  return parsed as ContactFormData;
}

export async function decrypt_contact(
  contact: Contact,
): Promise<DecryptedContact> {
  const data = await decrypt_contact_data(
    contact.encrypted_data,
    contact.data_nonce,
    contact.integrity_hash,
    contact.data_version,
  );

  return {
    id: contact.id,
    first_name: data.first_name,
    last_name: data.last_name,
    emails: data.emails,
    phone: data.phone,
    company: data.company,
    job_title: data.job_title,
    address: data.address,
    birthday: data.birthday,
    social_links: data.social_links,
    relationship: data.relationship,
    notes: data.notes,
    avatar_url: data.avatar_url,
    is_favorite: data.is_favorite ?? false,
    groups: data.groups,
    created_at: contact.created_at,
    updated_at: contact.updated_at,
  };
}

export async function decrypt_contacts(
  contacts: Contact[],
): Promise<DecryptedContact[]> {
  return Promise.all(contacts.map((contact) => decrypt_contact(contact)));
}

export async function decrypt_contact_group(
  group: ContactGroupEncrypted,
): Promise<ContactGroup> {
  const key = await get_contacts_encryption_key();
  const ciphertext = base64_to_array(group.encrypted_name);
  const nonce = base64_to_array(group.name_nonce);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  const decoder = new TextDecoder();
  const name = decoder.decode(decrypted);

  return {
    id: group.id,
    name,
    color: group.color,
    contact_count: group.contact_count,
    created_at: group.created_at,
  };
}

export async function decrypt_contact_groups(
  groups: ContactGroupEncrypted[],
): Promise<ContactGroup[]> {
  return Promise.all(groups.map((group) => decrypt_contact_group(group)));
}

export async function list_contacts(
  params: ListContactsParams = {},
): Promise<ApiResponse<ContactsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params.cursor) {
    query_params.set("cursor", params.cursor);
  }
  if (params.group_id) {
    query_params.set("group_id", params.group_id);
  }
  const query_string = query_params.toString();
  const endpoint = `/contacts/v1${query_string ? `?${query_string}` : ""}`;

  return api_client.get<ContactsListResponse>(endpoint);
}

export async function get_contact(
  contact_id: string,
): Promise<ApiResponse<Contact>> {
  return api_client.get<Contact>(`/contacts/v1/${contact_id}`);
}

export async function create_contact(
  data: CreateContactRequest,
): Promise<ApiResponse<CreateContactResponse>> {
  return api_client.post<CreateContactResponse>("/contacts/v1", data);
}

export async function create_contact_encrypted(
  form_data: ContactFormData,
): Promise<ApiResponse<CreateContactResponse>> {
  try {
    const { encrypted_data, data_nonce, integrity_hash } =
      await encrypt_contact_data(form_data);
    const contact_token = await generate_contact_token(form_data);
    const search_tokens = await generate_search_tokens(form_data);

    return create_contact({
      contact_token,
      name_search_token: search_tokens.name_token,
      email_search_token: search_tokens.email_token,
      company_search_token: search_tokens.company_token,
      encrypted_data,
      data_nonce,
      integrity_hash,
      data_version: CONTACT_DATA_VERSION,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to encrypt contact data",
    };
  }
}

export async function update_contact(
  contact_id: string,
  data: UpdateContactRequest,
): Promise<ApiResponse<UpdateContactResponse>> {
  return api_client.put<UpdateContactResponse>(
    `/contacts/v1/${contact_id}`,
    data,
  );
}

export async function update_contact_encrypted(
  contact_id: string,
  form_data: ContactFormData,
): Promise<ApiResponse<UpdateContactResponse>> {
  try {
    const { encrypted_data, data_nonce, integrity_hash } =
      await encrypt_contact_data(form_data);
    const search_tokens = await generate_search_tokens(form_data);

    return update_contact(contact_id, {
      encrypted_data,
      data_nonce,
      integrity_hash,
      name_search_token: search_tokens.name_token,
      email_search_token: search_tokens.email_token,
      company_search_token: search_tokens.company_token,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to encrypt contact data",
    };
  }
}

export async function delete_contact(
  contact_id: string,
): Promise<ApiResponse<DeleteContactResponse>> {
  return api_client.delete<DeleteContactResponse>(`/contacts/v1/${contact_id}`);
}

export async function bulk_delete_contacts(
  data: BulkDeleteContactsRequest,
): Promise<ApiResponse<BulkDeleteContactsResponse>> {
  return api_client.delete<BulkDeleteContactsResponse>("/contacts/v1", {
    body: JSON.stringify(data),
  });
}

export async function search_contacts(
  query: string,
  field: "name" | "email" | "company" | "all" = "all",
  limit?: number,
): Promise<ApiResponse<SearchContactsResponse>> {
  const search_token = await generate_search_token(query);
  const query_params = new URLSearchParams();

  query_params.set("q", search_token);
  query_params.set("field", field);
  if (limit !== undefined) {
    query_params.set("limit", limit.toString());
  }

  return api_client.get<SearchContactsResponse>(
    `/contacts/v1/search?${query_params.toString()}`,
  );
}

export async function list_contact_groups(): Promise<
  ApiResponse<{ groups: ContactGroup[] }>
> {
  const response = await api_client.get<{ groups: ContactGroupEncrypted[] }>(
    "/contacts/v1/groups",
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch contact groups" };
  }

  try {
    const decrypted_groups = await decrypt_contact_groups(response.data.groups);

    return { data: { groups: decrypted_groups } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt contact groups",
    };
  }
}

interface CreateGroupResponse {
  id: string;
  created_at: string;
}

export async function create_contact_group(
  data: ContactGroupFormData,
): Promise<ApiResponse<ContactGroup>> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    return { error: "No encryption key available" };
  }

  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    return { error: "No encryption key available" };
  }

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data.name);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const group_token = await generate_search_token(data.name);

  const response = await api_client.post<CreateGroupResponse>(
    "/contacts/v1/groups",
    {
      group_token,
      encrypted_name: array_to_base64(new Uint8Array(ciphertext)),
      name_nonce: array_to_base64(nonce),
      color: data.color,
    },
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to create contact group" };
  }

  return {
    data: {
      id: response.data.id,
      name: data.name,
      color: data.color,
      contact_count: 0,
      created_at: response.data.created_at,
    },
  };
}

export async function delete_contact_group(
  group_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/v1/groups/${group_id}`,
  );
}

export async function add_contact_to_group(
  contact_id: string,
  group_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/contacts/v1/${contact_id}/groups/${group_id}`,
    {},
  );
}

export async function remove_contact_from_group(
  contact_id: string,
  group_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/v1/${contact_id}/groups/${group_id}`,
  );
}

export async function get_contacts_count(): Promise<
  ApiResponse<{ count: number }>
> {
  return api_client.get<{ count: number }>("/contacts/v1/count", {
    cache_ttl: 60_000,
  });
}
