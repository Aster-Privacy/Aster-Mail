import { api_client, type ApiResponse } from "./client";

import {
  get_derived_encryption_key,
  get_or_create_derived_encryption_crypto_key,
} from "@/services/crypto/memory_key_store";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export interface ContactAvatar {
  id: string;
  contact_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_content_type: string;
  content_type_nonce: string;
  size_bytes: number;
  created_at: string;
}

export interface CreateAvatarRequest {
  contact_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_content_type: string;
  content_type_nonce: string;
  size_bytes: number;
}

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }

  return arr;
}

export function validate_avatar_file(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "File must be an image" };
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return {
      valid: false,
      error: `File size must be less than ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
    };
  }

  const allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  if (!allowed_types.includes(file.type)) {
    return { valid: false, error: "Allowed formats: JPEG, PNG, GIF, WebP" };
  }

  return { valid: true };
}

export async function compress_and_resize_image(
  file: File,
  max_width: number = 400,
  max_height: number = 400,
  quality: number = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;

      if (width > max_width || height > max_height) {
        const ratio = Math.min(max_width / width, max_height / height);

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));

        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to compress image"));
          }
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export async function encrypt_avatar(
  data: ArrayBuffer,
  content_type: string,
): Promise<{
  encrypted_data: string;
  data_nonce: string;
  encrypted_content_type: string;
  content_type_nonce: string;
} | null> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) return null;

  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) return null;

  const encoder = new TextEncoder();

  const data_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: data_nonce },
    key,
    data,
  );

  const content_type_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_content_type = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: content_type_nonce },
    key,
    encoder.encode(content_type),
  );

  return {
    encrypted_data: array_to_base64(new Uint8Array(encrypted_data)),
    data_nonce: array_to_base64(data_nonce),
    encrypted_content_type: array_to_base64(
      new Uint8Array(encrypted_content_type),
    ),
    content_type_nonce: array_to_base64(content_type_nonce),
  };
}

export async function decrypt_avatar(
  encrypted_data: string,
  data_nonce: string,
  encrypted_content_type: string,
  content_type_nonce: string,
): Promise<{ data: ArrayBuffer; content_type: string } | null> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) return null;

  try {
    const decrypted_data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(data_nonce) },
      key,
      base64_to_array(encrypted_data),
    );

    const decrypted_content_type = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(content_type_nonce) },
      key,
      base64_to_array(encrypted_content_type),
    );

    const decoder = new TextDecoder();

    return {
      data: decrypted_data,
      content_type: decoder.decode(decrypted_content_type),
    };
  } catch {
    return null;
  }
}

export async function upload_contact_avatar(
  contact_id: string,
  file: File,
): Promise<ApiResponse<ContactAvatar>> {
  const validation = validate_avatar_file(file);

  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    const compressed = await compress_and_resize_image(file);
    const array_buffer = await compressed.arrayBuffer();

    const encrypted = await encrypt_avatar(array_buffer, "image/jpeg");

    if (!encrypted) {
      return { error: "Failed to encrypt avatar" };
    }

    const request: CreateAvatarRequest = {
      contact_id,
      ...encrypted,
      size_bytes: compressed.size,
    };

    return api_client.post<ContactAvatar>(
      `/contacts/v1/${contact_id}/avatar`,
      request,
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to upload avatar",
    };
  }
}

export async function get_contact_avatar(
  contact_id: string,
): Promise<ApiResponse<string | null>> {
  const response = await api_client.get<ContactAvatar | null>(
    `/contacts/v1/${contact_id}/avatar`,
  );

  if (response.error || !response.data) {
    return { data: null };
  }

  const decrypted = await decrypt_avatar(
    response.data.encrypted_data,
    response.data.data_nonce,
    response.data.encrypted_content_type,
    response.data.content_type_nonce,
  );

  if (!decrypted) {
    return { error: "Failed to decrypt avatar" };
  }

  const blob = new Blob([decrypted.data], { type: decrypted.content_type });
  const url = URL.createObjectURL(blob);

  return { data: url };
}

export async function delete_contact_avatar(
  contact_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/v1/${contact_id}/avatar`,
  );
}

export function create_avatar_data_url(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AVATAR_COLORS = [
  { id: "blue", bg: "#3B82F6", text: "#FFFFFF" },
  { id: "green", bg: "#22C55E", text: "#FFFFFF" },
  { id: "purple", bg: "#A855F7", text: "#FFFFFF" },
  { id: "pink", bg: "#EC4899", text: "#FFFFFF" },
  { id: "orange", bg: "#F97316", text: "#FFFFFF" },
  { id: "teal", bg: "#14B8A6", text: "#FFFFFF" },
  { id: "red", bg: "#EF4444", text: "#FFFFFF" },
  { id: "indigo", bg: "#6366F1", text: "#FFFFFF" },
  { id: "amber", bg: "#F59E0B", text: "#FFFFFF" },
  { id: "cyan", bg: "#06B6D4", text: "#FFFFFF" },
  { id: "gray", bg: "#6B7280", text: "#FFFFFF" },
  { id: "rose", bg: "#F43F5E", text: "#FFFFFF" },
] as const;

export type AvatarColorId = (typeof AVATAR_COLORS)[number]["id"];
