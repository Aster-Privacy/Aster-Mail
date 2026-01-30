import { api_client, type ApiResponse } from "./client";

interface PublicKeyResponse {
  username: string;
  public_key: string;
}

export interface ExternalKeyInfo {
  email: string;
  found: boolean;
  public_key: string | null;
  fingerprint: string | null;
  source: string | null;
  expires_at: string | null;
}

interface DiscoverKeyResponse {
  email: string;
  found: boolean;
  public_key: string | null;
  fingerprint: string | null;
  source: string | null;
  expires_at: string | null;
}

interface DiscoverKeysResponse {
  keys: DiscoverKeyResponse[];
}

const external_key_cache = new Map<
  string,
  { key: ExternalKeyInfo; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function get_cached_key(email: string): ExternalKeyInfo | null {
  const cached = external_key_cache.get(email.toLowerCase());

  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    external_key_cache.delete(email.toLowerCase());

    return null;
  }

  return cached.key;
}

function set_cached_key(email: string, key: ExternalKeyInfo): void {
  external_key_cache.set(email.toLowerCase(), {
    key,
    timestamp: Date.now(),
  });
}

export async function get_recipient_public_key(
  username: string,
): Promise<ApiResponse<PublicKeyResponse>> {
  return api_client.get<PublicKeyResponse>(
    `/keys/public/${encodeURIComponent(username)}`,
  );
}

export async function discover_external_key(
  email: string,
): Promise<ApiResponse<ExternalKeyInfo>> {
  const cached = get_cached_key(email);

  if (cached) {
    return { data: cached };
  }

  const response = await api_client.post<DiscoverKeyResponse>(
    "/keys/external/discover",
    { email },
  );

  if (response.data) {
    const key_info: ExternalKeyInfo = {
      email: response.data.email,
      found: response.data.found,
      public_key: response.data.public_key,
      fingerprint: response.data.fingerprint,
      source: response.data.source,
      expires_at: response.data.expires_at,
    };

    set_cached_key(email, key_info);

    return { data: key_info };
  }

  return { error: response.error };
}

export async function discover_external_keys_batch(
  emails: string[],
): Promise<ApiResponse<ExternalKeyInfo[]>> {
  if (emails.length === 0) {
    return { data: [] };
  }

  const results: ExternalKeyInfo[] = [];
  const emails_to_fetch: string[] = [];

  for (const email of emails) {
    const cached = get_cached_key(email);

    if (cached) {
      results.push(cached);
    } else {
      emails_to_fetch.push(email);
    }
  }

  if (emails_to_fetch.length === 0) {
    return { data: results };
  }

  const response = await api_client.post<DiscoverKeysResponse>(
    "/keys/external/discover/batch",
    { emails: emails_to_fetch },
  );

  if (response.data) {
    for (const key_response of response.data.keys) {
      const key_info: ExternalKeyInfo = {
        email: key_response.email,
        found: key_response.found,
        public_key: key_response.public_key,
        fingerprint: key_response.fingerprint,
        source: key_response.source,
        expires_at: key_response.expires_at,
      };

      set_cached_key(key_response.email, key_info);
      results.push(key_info);
    }

    return { data: results };
  }

  return {
    data: results.length > 0 ? results : undefined,
    error: response.error,
  };
}

export function has_pgp_key(key_info: ExternalKeyInfo | null): boolean {
  return key_info !== null && key_info.found && key_info.public_key !== null;
}

export function format_fingerprint(fingerprint: string | null): string {
  if (!fingerprint) return "";

  const clean = fingerprint.replace(/\s/g, "").toUpperCase();

  const chunks: string[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    chunks.push(clean.slice(i, i + 4));
  }

  return chunks.join(" ");
}

export function get_key_source_label(source: string | null): string {
  switch (source) {
    case "wkd":
      return "Web Key Directory";
    case "keyserver":
      return "Public Keyserver";
    case "autocrypt":
      return "Autocrypt";
    case "dane":
      return "DANE";
    case "database":
      return "Cached";
    default:
      return "Unknown";
  }
}

export function clear_external_key_cache(): void {
  external_key_cache.clear();
}

export function extract_username_from_email(email: string): string | null {
  const parts = email.split("@");

  if (parts.length !== 2) return null;

  return parts[0];
}

const INTERNAL_DOMAINS = ["astermail.org", "aster.cx", "gs-cloud.space"];

export function is_internal_email(email: string): boolean {
  const lower_email = email.toLowerCase();

  return INTERNAL_DOMAINS.some((domain) => lower_email.endsWith(`@${domain}`));
}

interface PublishKeyResponse {
  success: boolean;
  url?: string;
}

export async function publish_key_to_wkd(): Promise<
  ApiResponse<PublishKeyResponse>
> {
  return api_client.post<PublishKeyResponse>("/keys/publish/wkd", {});
}

export async function unpublish_key_from_wkd(): Promise<
  ApiResponse<PublishKeyResponse>
> {
  return api_client.delete<PublishKeyResponse>("/keys/publish/wkd");
}

export async function publish_key_to_keyserver(): Promise<
  ApiResponse<PublishKeyResponse>
> {
  return api_client.post<PublishKeyResponse>("/keys/publish/keyserver", {});
}

export async function get_wkd_publication_status(): Promise<
  ApiResponse<{ published: boolean; url?: string }>
> {
  return api_client.get<{ published: boolean; url?: string }>(
    "/keys/publish/wkd/status",
  );
}

export async function get_keyserver_publication_status(): Promise<
  ApiResponse<{ published: boolean; fingerprint?: string }>
> {
  return api_client.get<{ published: boolean; fingerprint?: string }>(
    "/keys/publish/keyserver/status",
  );
}
