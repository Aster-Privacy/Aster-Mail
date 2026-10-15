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
import type { ExtractedPurchaseDetails } from "./types";

export const REVIEW_STORE_KEY = "receipt_review_v1";

const MAX_EMAIL_REVIEWS = 300;
const MAX_SENDER_MEMORIES = 200;
const MAX_FIELD_LENGTH = 80;
const MAX_KEY_LENGTH = 320;

export interface ReceiptReview {
  merchant_name: string | null;
  order_id: string | null;
  confirmed: boolean;
  hidden: boolean;
  updated_at: number;
}

interface SenderMemory {
  merchant_name: string;
  updated_at: number;
}

interface ReviewStore {
  emails: Record<string, ReceiptReview>;
  senders: Record<string, SenderMemory>;
}

export interface ReceiptCorrection {
  merchant_name: string | null;
  order_id: string | null;
}

export interface AppliedReceiptReview {
  details: ExtractedPurchaseDetails;
  review: ReceiptReview | null;
  merchant_from_memory: boolean;
}

export function sanitize_review_text(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);

  return cleaned.length > 0 ? cleaned : null;
}

function sanitize_key(value: string | undefined | null): string | null {
  if (!value) return null;

  const key = value.trim().toLowerCase().slice(0, MAX_KEY_LENGTH);

  return key.length > 0 ? key : null;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse_review(value: unknown): ReceiptReview | null {
  if (!is_record(value)) return null;

  const updated_at =
    typeof value.updated_at === "number" && Number.isFinite(value.updated_at)
      ? value.updated_at
      : 0;

  return {
    merchant_name: sanitize_review_text(value.merchant_name),
    order_id: sanitize_review_text(value.order_id),
    confirmed: value.confirmed === true,
    hidden: value.hidden === true,
    updated_at,
  };
}

function parse_sender(value: unknown): SenderMemory | null {
  if (!is_record(value)) return null;

  const merchant_name = sanitize_review_text(value.merchant_name);

  if (!merchant_name) return null;

  return {
    merchant_name,
    updated_at:
      typeof value.updated_at === "number" && Number.isFinite(value.updated_at)
        ? value.updated_at
        : 0,
  };
}

function empty_store(): ReviewStore {
  return { emails: {}, senders: {} };
}

function read_store(): ReviewStore {
  try {
    const raw = localStorage.getItem(REVIEW_STORE_KEY);

    if (!raw) return empty_store();

    const parsed: unknown = JSON.parse(raw);

    if (!is_record(parsed)) return empty_store();

    const store = empty_store();

    if (is_record(parsed.emails)) {
      for (const [key, value] of Object.entries(parsed.emails)) {
        const safe_key = sanitize_key(key);
        const review = parse_review(value);

        if (safe_key && review) store.emails[safe_key] = review;
      }
    }

    if (is_record(parsed.senders)) {
      for (const [key, value] of Object.entries(parsed.senders)) {
        const safe_key = sanitize_key(key);
        const sender = parse_sender(value);

        if (safe_key && sender) store.senders[safe_key] = sender;
      }
    }

    return store;
  } catch {
    return empty_store();
  }
}

function prune<T extends { updated_at: number }>(
  entries: Record<string, T>,
  limit: number,
): Record<string, T> {
  const keys = Object.keys(entries);

  if (keys.length <= limit) return entries;

  const kept = keys
    .sort((a, b) => entries[b].updated_at - entries[a].updated_at)
    .slice(0, limit);

  return Object.fromEntries(kept.map((key) => [key, entries[key]]));
}

function write_store(store: ReviewStore) {
  try {
    localStorage.setItem(
      REVIEW_STORE_KEY,
      JSON.stringify({
        emails: prune(store.emails, MAX_EMAIL_REVIEWS),
        senders: prune(store.senders, MAX_SENDER_MEMORIES),
      }),
    );
  } catch {
    return;
  }
}

export function get_receipt_review(
  email_id: string | undefined,
): ReceiptReview | null {
  const key = sanitize_key(email_id);

  if (!key) return null;

  return read_store().emails[key] ?? null;
}

export function get_sender_merchant(
  sender: string | undefined | null,
): string | null {
  const key = sanitize_key(sender);

  if (!key) return null;

  return read_store().senders[key]?.merchant_name ?? null;
}

function update_review(
  email_id: string | undefined,
  patch: Partial<Omit<ReceiptReview, "updated_at">>,
): ReceiptReview | null {
  const key = sanitize_key(email_id);

  if (!key) return null;

  const store = read_store();
  const current = store.emails[key] ?? {
    merchant_name: null,
    order_id: null,
    confirmed: false,
    hidden: false,
    updated_at: 0,
  };
  const next: ReceiptReview = { ...current, ...patch, updated_at: Date.now() };

  store.emails[key] = next;
  write_store(store);

  return next;
}

export function save_receipt_correction(
  email_id: string | undefined,
  sender: string | undefined | null,
  correction: ReceiptCorrection,
): ReceiptReview | null {
  const merchant_name = sanitize_review_text(correction.merchant_name);
  const order_id = sanitize_review_text(correction.order_id);
  const review = update_review(email_id, {
    merchant_name,
    order_id,
    confirmed: false,
    hidden: false,
  });
  const sender_key = sanitize_key(sender);

  if (merchant_name && sender_key) {
    const store = read_store();

    store.senders[sender_key] = { merchant_name, updated_at: Date.now() };
    write_store(store);
  }

  return review;
}

export function confirm_receipt(email_id: string | undefined) {
  return update_review(email_id, { confirmed: true, hidden: false });
}

export function hide_receipt(email_id: string | undefined) {
  return update_review(email_id, { hidden: true });
}

export function apply_receipt_review(
  details: ExtractedPurchaseDetails,
  email_id: string | undefined,
): AppliedReceiptReview {
  const review = get_receipt_review(email_id);
  const remembered = review?.merchant_name
    ? null
    : get_sender_merchant(details.merchant_source);
  const merchant_name =
    review?.merchant_name ?? remembered ?? details.merchant_name;
  const order_id = review?.order_id ?? details.order_id;

  if (merchant_name === details.merchant_name && order_id === details.order_id)
    return { details, review, merchant_from_memory: false };

  return {
    details: { ...details, merchant_name, order_id },
    review,
    merchant_from_memory: remembered !== null,
  };
}
