import { list_mail_items } from "@/services/api/mail";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { get_passphrase_bytes } from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  track_subscription,
  type SubscriptionCategory,
} from "@/services/api/subscriptions";
import {
  detect_unsubscribe_info,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";

interface DecryptedEnvelope {
  from?: { name?: string; email?: string };
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
  html_body?: string;
  text_body?: string;
}

interface SenderInfo {
  email: string;
  name?: string;
  domain: string;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  category: SubscriptionCategory;
  count: number;
}

const NEWSLETTER_DOMAINS = [
  "substack.com",
  "mailchimp.com",
  "sendgrid.net",
  "constantcontact.com",
  "mailgun.net",
  "sendinblue.com",
  "mailjet.com",
  "campaign-archive.com",
];

const MARKETING_DOMAINS = [
  "amazonses.com",
  "salesforce.com",
  "hubspot.com",
  "marketo.com",
  "pardot.com",
  "eloqua.com",
];

const SOCIAL_DOMAINS = [
  "facebookmail.com",
  "twitter.com",
  "linkedin.com",
  "instagram.com",
  "tiktok.com",
  "reddit.com",
  "discord.com",
];

const TRANSACTIONAL_KEYWORDS = [
  "receipt",
  "order",
  "confirmation",
  "shipping",
  "tracking",
  "invoice",
  "payment",
  "password",
  "verify",
  "security",
];

function categorize_sender(
  domain: string,
  sender_name: string,
  has_list_unsubscribe: boolean,
): SubscriptionCategory {
  const domain_lower = domain.toLowerCase();
  const name_lower = sender_name.toLowerCase();

  if (NEWSLETTER_DOMAINS.some((d) => domain_lower.includes(d))) {
    return "newsletter";
  }

  if (MARKETING_DOMAINS.some((d) => domain_lower.includes(d))) {
    return "marketing";
  }

  if (SOCIAL_DOMAINS.some((d) => domain_lower.includes(d))) {
    return "social";
  }

  if (TRANSACTIONAL_KEYWORDS.some((k) => name_lower.includes(k))) {
    return "transactional";
  }

  if (has_list_unsubscribe) {
    if (
      name_lower.includes("newsletter") ||
      name_lower.includes("digest") ||
      name_lower.includes("weekly")
    ) {
      return "newsletter";
    }
    if (
      name_lower.includes("promo") ||
      name_lower.includes("offer") ||
      name_lower.includes("deal")
    ) {
      return "marketing";
    }
  }

  return "unknown";
}

async function decrypt_envelope(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    const nonce_bytes = base64_to_array(nonce);

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    return null;
  } catch {
    return null;
  }
}

export interface ScanProgress {
  total: number;
  processed: number;
  new_subscriptions: number;
  updated_subscriptions: number;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

export async function scan_inbox_for_subscriptions(
  on_progress?: ScanProgressCallback,
): Promise<{ new_count: number; updated_count: number }> {
  const senders = new Map<string, SenderInfo>();
  let new_count = 0;
  let updated_count = 0;

  const { data, error } = await list_mail_items({
    item_type: "received",
    limit: 200,
  });

  if (error || !data) {
    return { new_count: 0, updated_count: 0 };
  }

  const { items } = data;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const envelope = await decrypt_envelope(
        item.encrypted_envelope,
        item.envelope_nonce,
      );

      if (envelope?.from?.email) {
        const email = envelope.from.email.toLowerCase();
        const domain = get_sender_domain(email);

        const unsubscribe_info = detect_unsubscribe_info(
          envelope.html_body,
          envelope.text_body,
          {
            list_unsubscribe: envelope.list_unsubscribe,
            list_unsubscribe_post: envelope.list_unsubscribe_post,
          },
        );

        const existing = senders.get(email);

        if (existing) {
          existing.count++;
          if (!existing.unsubscribe_link && unsubscribe_info.unsubscribe_link) {
            existing.unsubscribe_link = unsubscribe_info.unsubscribe_link;
          }
          if (
            !existing.list_unsubscribe_header &&
            unsubscribe_info.list_unsubscribe_header
          ) {
            existing.list_unsubscribe_header =
              unsubscribe_info.list_unsubscribe_header;
          }
        } else {
          const category = categorize_sender(
            domain,
            envelope.from.name || email,
            unsubscribe_info.has_unsubscribe,
          );

          senders.set(email, {
            email,
            name: envelope.from.name,
            domain,
            unsubscribe_link: unsubscribe_info.unsubscribe_link,
            list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
            category,
            count: 1,
          });
        }
      }
    } catch {
      void 0;
    }

    if (on_progress && i % 10 === 0) {
      on_progress({
        total,
        processed: i + 1,
        new_subscriptions: new_count,
        updated_subscriptions: updated_count,
      });
    }
  }

  for (const sender of senders.values()) {
    if (sender.count < 2) continue;

    try {
      const result = await track_subscription({
        sender_email: sender.email,
        sender_name: sender.name,
        unsubscribe_link: sender.unsubscribe_link,
        list_unsubscribe_header: sender.list_unsubscribe_header,
        category: sender.category,
      });

      if (result.data) {
        if (result.data.is_new) {
          new_count++;
        } else {
          updated_count++;
        }
      }
    } catch {
      void 0;
    }
  }

  if (on_progress) {
    on_progress({
      total,
      processed: total,
      new_subscriptions: new_count,
      updated_subscriptions: updated_count,
    });
  }

  return { new_count, updated_count };
}
