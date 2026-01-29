interface CacheEntry {
  exists: boolean;
  timestamp: number;
}

const LOGO_CACHE = new Map<string, CacheEntry>();
const PRELOAD_QUEUE = new Set<string>();
const MAX_CONCURRENT_PRELOADS = 3;
const CACHE_TTL_SUCCESS = 24 * 60 * 60 * 1000;
const CACHE_TTL_FAILURE = 5 * 60 * 1000;
let active_preloads = 0;

function is_cache_entry_valid(entry: CacheEntry): boolean {
  const ttl = entry.exists ? CACHE_TTL_SUCCESS : CACHE_TTL_FAILURE;

  return Date.now() - entry.timestamp < ttl;
}

export function get_logo_url(domain: string): string {
  if (!domain || !domain.includes(".")) return "";
  const clean_domain = domain.toLowerCase().trim();

  return `/api/logos/${encodeURIComponent(clean_domain)}`;
}

export function get_email_logo_url(email: string): string {
  const match = email.match(/@([^@]+)$/);

  if (!match) return "";

  return get_logo_url(match[1]);
}

export function extract_domain_from_email(email: string): string {
  const match = email.match(/@([^@]+)$/);

  return match ? match[1].toLowerCase() : "";
}

export function is_logo_cached(domain: string): boolean | null {
  const clean = domain.toLowerCase();
  const entry = LOGO_CACHE.get(clean);

  if (entry && is_cache_entry_valid(entry)) {
    return entry.exists;
  }
  if (entry) {
    LOGO_CACHE.delete(clean);
  }

  return null;
}

export async function preload_logo(domain: string): Promise<boolean> {
  const clean = domain.toLowerCase();
  const cached = is_logo_cached(clean);

  if (cached !== null) {
    return cached;
  }

  const url = get_logo_url(clean);

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      LOGO_CACHE.set(clean, { exists: true, timestamp: Date.now() });
      resolve(true);
    };

    img.onerror = () => {
      LOGO_CACHE.set(clean, { exists: false, timestamp: Date.now() });
      resolve(false);
    };

    img.src = url;
  });
}

async function process_preload_queue(): Promise<void> {
  if (active_preloads >= MAX_CONCURRENT_PRELOADS || PRELOAD_QUEUE.size === 0) {
    return;
  }

  const domain = PRELOAD_QUEUE.values().next().value;

  if (!domain) return;

  PRELOAD_QUEUE.delete(domain);
  active_preloads++;

  try {
    await preload_logo(domain);
  } finally {
    active_preloads--;
    process_preload_queue();
  }
}

export function queue_logo_preload(domain: string): void {
  const clean = domain.toLowerCase();

  if (is_logo_cached(clean) !== null || PRELOAD_QUEUE.has(clean)) {
    return;
  }
  PRELOAD_QUEUE.add(clean);
  process_preload_queue();
}

export function preload_logos_for_emails(emails: string[]): void {
  const domains = new Set<string>();

  for (const email of emails) {
    const domain = extract_domain_from_email(email);

    if (domain && is_logo_cached(domain) === null) {
      domains.add(domain);
    }
  }
  for (const domain of domains) {
    queue_logo_preload(domain);
  }
}

export function clear_logo_cache(domain?: string): void {
  if (domain) {
    LOGO_CACHE.delete(domain.toLowerCase());
  } else {
    LOGO_CACHE.clear();
  }
}
