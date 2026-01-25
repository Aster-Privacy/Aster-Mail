import { api_client } from "./client";

import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";

export interface ReferralMilestone {
  referrals_needed: number;
  current_count: number;
  reward_mb: number;
  name: string;
}

export interface ReferralSummary {
  id: string;
  encrypted_name?: string;
  name_nonce?: string;
  status: string;
  reward_mb: number;
  created_at: string;
  completed_at?: string;
}

export interface ReferralStats {
  referral_code: string;
  referral_link: string;
  total_referrals: number;
  successful_referrals: number;
  pending_referrals: number;
  total_storage_earned_mb: number;
  base_storage_mb: number;
  bonus_storage_mb: number;
  max_bonus_storage_mb: number;
  next_milestone?: ReferralMilestone;
  recent_referrals: ReferralSummary[];
}

export interface PendingInvite {
  id: string;
  encrypted_email: string;
  email_nonce: string;
  status: string;
  sent_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  encrypted_name?: string;
  name_nonce?: string;
  successful_referrals: number;
  is_current_user: boolean;
}

async function get_referral_encryption_key(): Promise<CryptoKey> {
  const derived_key = get_derived_encryption_key();

  if (!derived_key) {
    throw new Error("Encryption key not available");
  }

  const key_material = new Uint8Array(derived_key.length + 19);

  key_material.set(derived_key);
  key_material.set(
    new TextEncoder().encode("referral_encryption"),
    derived_key.length,
  );

  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", key_material),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt_email_for_invite(email: string): Promise<{
  encrypted_email: string;
  email_nonce: string;
  email_hash: string;
}> {
  const key = await get_referral_encryption_key();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(email.toLowerCase().trim());

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoded,
  );

  const hash_buffer = await crypto.subtle.digest("SHA-256", encoded);
  const hash_array = Array.from(new Uint8Array(hash_buffer));
  const email_hash = hash_array
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    encrypted_email: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    email_nonce: btoa(String.fromCharCode(...nonce)),
    email_hash,
  };
}

export async function decrypt_email(
  encrypted_email: string,
  email_nonce: string,
): Promise<string> {
  const key = await get_referral_encryption_key();
  const nonce = Uint8Array.from(atob(email_nonce), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encrypted_email), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return new TextDecoder().decode(decrypted);
}

export async function get_referral_stats(): Promise<{
  data?: { stats: ReferralStats };
  error?: string;
}> {
  return api_client.get<{ stats: ReferralStats }>("/referrals/stats");
}

export async function generate_referral_code(): Promise<{
  data?: { code: string; referral_link: string };
  error?: string;
}> {
  return api_client.post<{ code: string; referral_link: string }>(
    "/referrals/code",
    {},
  );
}

export async function send_referral_invite(email: string): Promise<{
  data?: { success: boolean; invite_id: string };
  error?: string;
}> {
  const encrypted = await encrypt_email_for_invite(email);

  return api_client.post<{ success: boolean; invite_id: string }>(
    "/referrals/invite",
    {
      encrypted_email: encrypted.encrypted_email,
      email_nonce: encrypted.email_nonce,
      email_hash: encrypted.email_hash,
    },
  );
}

export async function bulk_send_invites(emails: string[]): Promise<{
  data?: { success: boolean; sent_count: number; failed_count: number };
  error?: string;
}> {
  const invites = await Promise.all(
    emails.map(async (email) => {
      const encrypted = await encrypt_email_for_invite(email);

      return {
        encrypted_email: encrypted.encrypted_email,
        email_nonce: encrypted.email_nonce,
        email_hash: encrypted.email_hash,
      };
    }),
  );

  return api_client.post<{
    success: boolean;
    sent_count: number;
    failed_count: number;
  }>("/referrals/invite/bulk", { invites });
}

export async function validate_referral_code(code: string): Promise<{
  data?: { valid: boolean; referrer_display_name?: string };
  error?: string;
}> {
  return api_client.post<{ valid: boolean; referrer_display_name?: string }>(
    "/referrals/validate",
    { code },
  );
}

export async function apply_referral_code(code: string): Promise<{
  data?: { success: boolean; bonus_storage_mb: number };
  error?: string;
}> {
  return api_client.post<{ success: boolean; bonus_storage_mb: number }>(
    "/referrals/apply",
    { code },
  );
}

export async function get_referral_history(
  limit?: number,
  offset?: number,
): Promise<{
  data?: {
    referrals: ReferralSummary[];
    total_count: number;
    has_more: boolean;
  };
  error?: string;
}> {
  return api_client.post<{
    referrals: ReferralSummary[];
    total_count: number;
    has_more: boolean;
  }>("/referrals/history", { limit, offset });
}

export async function get_pending_invites(limit?: number): Promise<{
  data?: { invites: PendingInvite[] };
  error?: string;
}> {
  return api_client.post<{ invites: PendingInvite[] }>(
    "/referrals/invites/pending",
    { limit },
  );
}

export async function get_leaderboard(): Promise<{
  data?: { entries: LeaderboardEntry[]; current_user_rank?: number };
  error?: string;
}> {
  return api_client.get<{
    entries: LeaderboardEntry[];
    current_user_rank?: number;
  }>("/referrals/leaderboard");
}

export function format_storage_size(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  return `${mb} MB`;
}

export function calculate_progress_percentage(
  earned_mb: number,
  max_mb: number,
): number {
  return Math.min(100, (earned_mb / max_mb) * 100);
}
