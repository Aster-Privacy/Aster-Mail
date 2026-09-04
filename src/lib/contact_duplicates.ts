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
import type { ContactFormData, DecryptedContact } from "@/types/contacts";

export const DUPLICATE_THRESHOLD = 70;

const MAX_COMPARED_CONTACTS = 4000;

export const contact_display_name = (contact: DecryptedContact): string => {
  const full = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

  return full || contact.emails[0] || "";
};

const normalize_text = (value: string | undefined): string =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const normalize_email = (value: string): string =>
  value.trim().toLowerCase();

export const email_identity = (value: string): string => {
  const normalized = normalize_email(value);
  const at = normalized.lastIndexOf("@");

  if (at <= 0) return normalized;

  const local = normalized.slice(0, at).split("+")[0];
  const domain = normalized.slice(at + 1);

  return `${local}@${domain}`;
};

export const normalize_phone = (value: string | undefined): string => {
  const digits = (value || "").replace(/\D/g, "");

  return digits.length >= 7 ? digits.slice(-10) : "";
};

const email_sets = (contact: DecryptedContact) => {
  const exact = new Set<string>();
  const identity = new Set<string>();

  for (const address of contact.emails) {
    if (!address.trim()) continue;
    exact.add(normalize_email(address));
    identity.add(email_identity(address));
  }

  return { exact, identity };
};

const intersects = (left: Set<string>, right: Set<string>): boolean => {
  for (const value of left) {
    if (right.has(value)) return true;
  }

  return false;
};

export const similarity_score = (
  left: DecryptedContact,
  right: DecryptedContact,
): number => {
  const left_emails = email_sets(left);
  const right_emails = email_sets(right);

  if (intersects(left_emails.exact, right_emails.exact)) return 100;

  const left_name = normalize_text(contact_display_name(left));
  const right_name = normalize_text(contact_display_name(right));
  const same_name = left_name.length > 0 && left_name === right_name;

  if (intersects(left_emails.identity, right_emails.identity)) {
    return same_name ? 95 : 85;
  }

  const left_phone = normalize_phone(left.phone);
  const right_phone = normalize_phone(right.phone);
  const same_phone = left_phone.length > 0 && left_phone === right_phone;

  if (same_name && same_phone) return 90;
  if (same_phone) return 75;

  if (same_name) {
    const left_company = normalize_text(left.company);
    const right_company = normalize_text(right.company);

    if (left_company.length > 0 && left_company === right_company) return 80;

    return 60;
  }

  return 0;
};

export interface DuplicateCluster {
  key: string;
  contacts: DecryptedContact[];
  score: number;
}

export const find_duplicate_clusters = (
  contacts: DecryptedContact[],
): DuplicateCluster[] => {
  const pool = contacts.slice(0, MAX_COMPARED_CONTACTS);
  const parent = new Map<string, string>();
  const best = new Map<string, number>();

  const find = (id: string): string => {
    let current = id;

    while (parent.get(current) !== current) {
      const next = parent.get(current);

      if (!next) break;
      parent.set(current, parent.get(next) ?? next);
      current = parent.get(current) ?? current;
    }

    return current;
  };

  const union = (left: string, right: string) => {
    const left_root = find(left);
    const right_root = find(right);

    if (left_root !== right_root) parent.set(right_root, left_root);
  };

  for (const contact of pool) parent.set(contact.id, contact.id);

  const buckets = new Map<string, DecryptedContact[]>();

  const add_to_bucket = (key: string, contact: DecryptedContact) => {
    if (!key) return;

    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(contact);

      return;
    }
    buckets.set(key, [contact]);
  };

  for (const contact of pool) {
    for (const identity of email_sets(contact).identity) {
      add_to_bucket(`e:${identity}`, contact);
    }
    add_to_bucket(
      `n:${normalize_text(contact_display_name(contact))}`,
      contact,
    );

    const phone = normalize_phone(contact.phone);

    if (phone) add_to_bucket(`p:${phone}`, contact);
  }

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const score = similarity_score(bucket[i], bucket[j]);

        if (score < DUPLICATE_THRESHOLD) continue;
        union(bucket[i].id, bucket[j].id);
        for (const id of [bucket[i].id, bucket[j].id]) {
          best.set(id, Math.max(best.get(id) ?? 0, score));
        }
      }
    }
  }

  const grouped = new Map<string, DecryptedContact[]>();

  for (const contact of pool) {
    const root = find(contact.id);
    const existing = grouped.get(root);

    if (existing) {
      existing.push(contact);
      continue;
    }
    grouped.set(root, [contact]);
  }

  const clusters: DuplicateCluster[] = [];

  for (const [key, members] of grouped) {
    if (members.length < 2) continue;

    let score = 0;

    for (const member of members) {
      score = Math.max(score, best.get(member.id) ?? 0);
    }

    clusters.push({ key, contacts: members, score });
  }

  return clusters.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    return b.contacts.length - a.contacts.length;
  });
};

export const count_duplicate_contacts = (
  clusters: DuplicateCluster[],
): number =>
  clusters.reduce((total, cluster) => total + cluster.contacts.length, 0);

const first_defined = <T>(
  contacts: DecryptedContact[],
  read: (contact: DecryptedContact) => T | undefined,
): T | undefined => {
  for (const contact of contacts) {
    const value = read(contact);

    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return undefined;
};

const union_strings = (values: (string[] | undefined)[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const list of values) {
    for (const value of list ?? []) {
      const trimmed = value.trim();

      if (!trimmed) continue;

      const key = trimmed.toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
};

export const merge_contacts = (
  ordered: DecryptedContact[],
): ContactFormData => {
  const primary = ordered[0];

  const notes = union_strings([
    ordered.map((contact) => contact.notes ?? "").filter(Boolean),
  ]).join("\n\n");

  const merged: ContactFormData = {
    first_name: first_defined(ordered, (c) => c.first_name) ?? "",
    last_name: first_defined(ordered, (c) => c.last_name) ?? "",
    emails: union_strings(ordered.map((contact) => contact.emails)),
    phone: first_defined(ordered, (c) => c.phone),
    company: first_defined(ordered, (c) => c.company),
    job_title: first_defined(ordered, (c) => c.job_title),
    address: first_defined(ordered, (c) => c.address),
    birthday: first_defined(ordered, (c) => c.birthday),
    social_links: first_defined(ordered, (c) => c.social_links),
    relationship: first_defined(ordered, (c) => c.relationship),
    notes: notes || undefined,
    avatar_url: first_defined(ordered, (c) => c.avatar_url),
    profile_color: first_defined(ordered, (c) => c.profile_color),
    is_favorite: ordered.some((contact) => contact.is_favorite),
    groups: union_strings(ordered.map((contact) => contact.groups)),
    title: first_defined(ordered, (c) => c.title),
    middle_name: first_defined(ordered, (c) => c.middle_name),
    name_suffix: first_defined(ordered, (c) => c.name_suffix),
    nickname: first_defined(ordered, (c) => c.nickname),
    phonetic_first_name: first_defined(ordered, (c) => c.phonetic_first_name),
    phonetic_middle_name: first_defined(ordered, (c) => c.phonetic_middle_name),
    phonetic_last_name: first_defined(ordered, (c) => c.phonetic_last_name),
    pronouns: first_defined(ordered, (c) => c.pronouns),
    department: first_defined(ordered, (c) => c.department),
    comment: first_defined(ordered, (c) => c.comment),
    role: first_defined(ordered, (c) => c.role),
    phone_entries: first_defined(ordered, (c) => c.phone_entries),
    email_entries: first_defined(ordered, (c) => c.email_entries),
    address_entries: first_defined(ordered, (c) => c.address_entries),
    websites: first_defined(ordered, (c) => c.websites),
    date_entries: first_defined(ordered, (c) => c.date_entries),
    related_people: first_defined(ordered, (c) => c.related_people),
    instant_messengers: first_defined(ordered, (c) => c.instant_messengers),
    social_networks: first_defined(ordered, (c) => c.social_networks),
  };

  if (!merged.first_name && !merged.last_name && primary) {
    merged.first_name = primary.first_name;
    merged.last_name = primary.last_name;
  }

  return merged;
};
