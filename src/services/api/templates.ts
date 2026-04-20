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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { get_or_create_derived_encryption_crypto_key } from "@/services/crypto/memory_key_store";

export interface TemplateFormData {
  name: string;
  category: string;
  content: string;
  sort_order?: number;
}

export interface Template {
  id: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_category: string;
  category_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DecryptedTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ListTemplatesResponse {
  templates: Template[];
  total: number;
}

export interface CreateTemplateRequest {
  encrypted_name: string;
  name_nonce: string;
  encrypted_category: string;
  category_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  sort_order: number;
}

export interface CreateTemplateResponse {
  id: string;
  success: boolean;
  created_at: string;
}

export interface UpdateTemplateRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_category?: string;
  category_nonce?: string;
  encrypted_content?: string;
  content_nonce?: string;
  sort_order?: number;
}

export interface UpdateTemplateResponse {
  success: boolean;
  updated_at: string;
}

export interface DeleteTemplateResponse {
  success: boolean;
}

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

async function get_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

async function encrypt_string(
  plaintext: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await get_encryption_key();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

async function decrypt_string(
  encrypted: string,
  nonce: string,
): Promise<string> {
  const key = await get_encryption_key();
  const ciphertext = base64_to_array(encrypted);
  const iv = base64_to_array(nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_template(
  template: Template,
): Promise<DecryptedTemplate> {
  const [name, category, content] = await Promise.all([
    decrypt_string(template.encrypted_name, template.name_nonce),
    decrypt_string(template.encrypted_category, template.category_nonce),
    decrypt_string(template.encrypted_content, template.content_nonce),
  ]);

  return {
    id: template.id,
    name,
    category,
    content,
    sort_order: template.sort_order,
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
}

export async function decrypt_templates(
  templates: Template[],
): Promise<DecryptedTemplate[]> {
  return Promise.all(templates.map(decrypt_template));
}

export async function list_templates(): Promise<
  ApiResponse<{ templates: DecryptedTemplate[]; total: number }>
> {
  const response =
    await api_client.get<ListTemplatesResponse>("/mail/v1/templates");

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch templates" };
  }

  try {
    const decrypted = await decrypt_templates(response.data.templates);

    return { data: { templates: decrypted, total: response.data.total } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt templates",
    };
  }
}

export async function get_template(
  template_id: string,
): Promise<ApiResponse<DecryptedTemplate>> {
  const response = await api_client.get<Template>(
    `/mail/v1/templates/${template_id}`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch template" };
  }

  try {
    const decrypted = await decrypt_template(response.data);

    return { data: decrypted };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt template",
    };
  }
}

export async function create_template(
  data: TemplateFormData,
): Promise<ApiResponse<CreateTemplateResponse>> {
  try {
    const [encrypted_name, encrypted_category, encrypted_content] =
      await Promise.all([
        encrypt_string(data.name),
        encrypt_string(data.category),
        encrypt_string(data.content),
      ]);

    const request: CreateTemplateRequest = {
      encrypted_name: encrypted_name.encrypted,
      name_nonce: encrypted_name.nonce,
      encrypted_category: encrypted_category.encrypted,
      category_nonce: encrypted_category.nonce,
      encrypted_content: encrypted_content.encrypted,
      content_nonce: encrypted_content.nonce,
      sort_order: data.sort_order ?? 0,
    };

    return api_client.post<CreateTemplateResponse>(
      "/mail/v1/templates",
      request,
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to encrypt template",
    };
  }
}

export async function update_template(
  template_id: string,
  data: Partial<TemplateFormData>,
): Promise<ApiResponse<UpdateTemplateResponse>> {
  try {
    const request: UpdateTemplateRequest = {};

    if (data.name !== undefined) {
      const encrypted = await encrypt_string(data.name);

      request.encrypted_name = encrypted.encrypted;
      request.name_nonce = encrypted.nonce;
    }

    if (data.category !== undefined) {
      const encrypted = await encrypt_string(data.category);

      request.encrypted_category = encrypted.encrypted;
      request.category_nonce = encrypted.nonce;
    }

    if (data.content !== undefined) {
      const encrypted = await encrypt_string(data.content);

      request.encrypted_content = encrypted.encrypted;
      request.content_nonce = encrypted.nonce;
    }

    if (data.sort_order !== undefined) {
      request.sort_order = data.sort_order;
    }

    return api_client.put<UpdateTemplateResponse>(
      `/mail/v1/templates/${template_id}`,
      request,
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to encrypt template",
    };
  }
}

export async function delete_template(
  template_id: string,
): Promise<ApiResponse<DeleteTemplateResponse>> {
  return api_client.delete<DeleteTemplateResponse>(
    `/mail/v1/templates/${template_id}`,
  );
}

export async function get_templates_count(): Promise<
  ApiResponse<{ count: number }>
> {
  return api_client.get<{ count: number }>("/mail/v1/templates/count");
}
