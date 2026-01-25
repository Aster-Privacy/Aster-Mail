import { api_client, type ApiResponse } from "./client";

import { get_or_create_derived_encryption_crypto_key } from "@/services/crypto/memory_key_store";

export interface SignatureFormData {
  name: string;
  content: string;
  is_html?: boolean;
}

export interface Signature {
  id: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  is_default: boolean;
  is_html: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecryptedSignature {
  id: string;
  name: string;
  content: string;
  is_default: boolean;
  is_html: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListSignaturesResponse {
  signatures: Signature[];
  total: number;
}

export interface CreateSignatureRequest {
  encrypted_name: string;
  name_nonce: string;
  encrypted_content: string;
  content_nonce: string;
  is_default: boolean;
  is_html: boolean;
}

export interface CreateSignatureResponse {
  id: string;
  success: boolean;
  created_at: string;
}

export interface UpdateSignatureRequest {
  encrypted_name?: string;
  name_nonce?: string;
  encrypted_content?: string;
  content_nonce?: string;
  is_html?: boolean;
}

export interface UpdateSignatureResponse {
  success: boolean;
  updated_at: string;
}

export interface DeleteSignatureResponse {
  success: boolean;
}

export interface SetDefaultResponse {
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
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_signature(
  signature: Signature,
): Promise<DecryptedSignature> {
  const [name, content] = await Promise.all([
    decrypt_string(signature.encrypted_name, signature.name_nonce),
    decrypt_string(signature.encrypted_content, signature.content_nonce),
  ]);

  return {
    id: signature.id,
    name,
    content,
    is_default: signature.is_default,
    is_html: signature.is_html,
    created_at: signature.created_at,
    updated_at: signature.updated_at,
  };
}

export async function decrypt_signatures(
  signatures: Signature[],
): Promise<DecryptedSignature[]> {
  return Promise.all(signatures.map(decrypt_signature));
}

export async function list_signatures(): Promise<
  ApiResponse<{ signatures: DecryptedSignature[]; total: number }>
> {
  const response = await api_client.get<ListSignaturesResponse>("/signatures");

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch signatures" };
  }

  try {
    const decrypted = await decrypt_signatures(response.data.signatures);

    return { data: { signatures: decrypted, total: response.data.total } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt signatures",
    };
  }
}

export async function get_signature(
  signature_id: string,
): Promise<ApiResponse<DecryptedSignature>> {
  const response = await api_client.get<Signature>(
    `/signatures/${signature_id}`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch signature" };
  }

  try {
    const decrypted = await decrypt_signature(response.data);

    return { data: decrypted };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt signature",
    };
  }
}

export async function get_default_signature(): Promise<
  ApiResponse<DecryptedSignature | null>
> {
  const response = await api_client.get<Signature | null>(
    "/signatures/default",
  );

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { data: null };
  }

  try {
    const decrypted = await decrypt_signature(response.data);

    return { data: decrypted };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt signature",
    };
  }
}

export async function create_signature(
  data: SignatureFormData,
  is_default: boolean = false,
): Promise<ApiResponse<CreateSignatureResponse>> {
  try {
    const [encrypted_name, encrypted_content] = await Promise.all([
      encrypt_string(data.name),
      encrypt_string(data.content),
    ]);

    const request: CreateSignatureRequest = {
      encrypted_name: encrypted_name.encrypted,
      name_nonce: encrypted_name.nonce,
      encrypted_content: encrypted_content.encrypted,
      content_nonce: encrypted_content.nonce,
      is_default,
      is_html: data.is_html ?? false,
    };

    return api_client.post<CreateSignatureResponse>("/signatures", request);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to encrypt signature",
    };
  }
}

export async function update_signature(
  signature_id: string,
  data: Partial<SignatureFormData>,
): Promise<ApiResponse<UpdateSignatureResponse>> {
  try {
    const request: UpdateSignatureRequest = {};

    if (data.name !== undefined) {
      const encrypted = await encrypt_string(data.name);

      request.encrypted_name = encrypted.encrypted;
      request.name_nonce = encrypted.nonce;
    }

    if (data.content !== undefined) {
      const encrypted = await encrypt_string(data.content);

      request.encrypted_content = encrypted.encrypted;
      request.content_nonce = encrypted.nonce;
    }

    if (data.is_html !== undefined) {
      request.is_html = data.is_html;
    }

    return api_client.put<UpdateSignatureResponse>(
      `/signatures/${signature_id}`,
      request,
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to encrypt signature",
    };
  }
}

export async function delete_signature(
  signature_id: string,
): Promise<ApiResponse<DeleteSignatureResponse>> {
  return api_client.delete<DeleteSignatureResponse>(
    `/signatures/${signature_id}`,
  );
}

export async function set_default_signature(
  signature_id: string,
): Promise<ApiResponse<SetDefaultResponse>> {
  return api_client.patch<SetDefaultResponse>(
    `/signatures/${signature_id}/default`,
    {},
  );
}

export async function get_signatures_count(): Promise<
  ApiResponse<{ count: number }>
> {
  return api_client.get<{ count: number }>("/signatures/count");
}
