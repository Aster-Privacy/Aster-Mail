import type { UnsubscribeInfo } from "@/types/email";

const UNSUBSCRIBE_LINK_PATTERNS = [
  /href=["']([^"']*unsubscribe[^"']*)["']/gi,
  /href=["']([^"']*opt-?out[^"']*)["']/gi,
  /href=["']([^"']*remove[^"']*list[^"']*)["']/gi,
  /href=["']([^"']*manage[^"']*preferences[^"']*)["']/gi,
  /href=["']([^"']*email[^"']*preferences[^"']*)["']/gi,
  /href=["']([^"']*subscription[^"']*settings[^"']*)["']/gi,
];

const UNSUBSCRIBE_TEXT_PATTERNS = [
  /unsubscribe/i,
  /opt[\s-]?out/i,
  /stop\s+receiving/i,
  /remove\s+(from|me)/i,
  /manage\s+(?:email\s+)?preferences/i,
  /update\s+(?:your\s+)?subscription/i,
];

function extract_link_from_anchor(
  html: string,
  pattern: RegExp,
): string | null {
  const matches = [...html.matchAll(pattern)];

  for (const match of matches) {
    const url = match[1];

    if (url && is_valid_url(url)) {
      return url;
    }
  }

  return null;
}

function is_valid_url(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extract_mailto_from_header(header: string): string | null {
  const mailto_match = header.match(/mailto:([^>,\s]+)/i);

  if (mailto_match) {
    return mailto_match[1];
  }

  return null;
}

function extract_http_from_header(header: string): string | null {
  const http_match = header.match(/<(https?:\/\/[^>]+)>/i);

  if (http_match) {
    return http_match[1];
  }

  const bare_match = header.match(/(https?:\/\/[^,\s>]+)/i);

  if (bare_match) {
    return bare_match[1];
  }

  return null;
}

export function detect_unsubscribe_info(
  html_content?: string,
  text_content?: string,
  headers?: { list_unsubscribe?: string; list_unsubscribe_post?: string },
): UnsubscribeInfo {
  const result: UnsubscribeInfo = {
    has_unsubscribe: false,
    method: "none",
  };

  if (headers?.list_unsubscribe) {
    result.list_unsubscribe_header = headers.list_unsubscribe;

    const mailto = extract_mailto_from_header(headers.list_unsubscribe);
    const http_link = extract_http_from_header(headers.list_unsubscribe);

    if (headers.list_unsubscribe_post && http_link) {
      result.has_unsubscribe = true;
      result.method = "one-click";
      result.unsubscribe_link = http_link;
      result.list_unsubscribe_post = headers.list_unsubscribe_post;
    } else if (http_link) {
      result.has_unsubscribe = true;
      result.method = "link";
      result.unsubscribe_link = http_link;
    } else if (mailto) {
      result.has_unsubscribe = true;
      result.method = "mailto";
      result.unsubscribe_mailto = mailto;
    }

    if (result.has_unsubscribe) {
      return result;
    }
  }

  if (html_content) {
    for (const pattern of UNSUBSCRIBE_LINK_PATTERNS) {
      const link = extract_link_from_anchor(html_content, pattern);

      if (link) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = link;

        return result;
      }
    }

    const unsubscribe_section_match = html_content.match(
      /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*(?:unsubscribe|opt[\s-]?out)[^<]*<\/a>/gi,
    );

    if (unsubscribe_section_match) {
      const href_match = unsubscribe_section_match[0].match(
        /href=["']([^"']+)["']/i,
      );

      if (href_match && is_valid_url(href_match[1])) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = href_match[1];

        return result;
      }
    }
  }

  if (text_content) {
    const url_pattern = /https?:\/\/[^\s]+(?:unsubscribe|opt-?out)[^\s]*/gi;
    const matches = text_content.match(url_pattern);

    if (matches && matches.length > 0) {
      const url = matches[0];

      if (is_valid_url(url)) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = url;

        return result;
      }
    }

    for (const pattern of UNSUBSCRIBE_TEXT_PATTERNS) {
      if (pattern.test(text_content)) {
        const all_urls = text_content.match(/https?:\/\/[^\s]+/g) || [];

        for (const url of all_urls) {
          if (
            url.toLowerCase().includes("unsubscribe") ||
            url.toLowerCase().includes("opt")
          ) {
            if (is_valid_url(url)) {
              result.has_unsubscribe = true;
              result.method = "link";
              result.unsubscribe_link = url;

              return result;
            }
          }
        }
      }
    }
  }

  return result;
}

export function has_unsubscribe_content(content?: string): boolean {
  if (!content) return false;

  for (const pattern of UNSUBSCRIBE_TEXT_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

export function get_unsubscribe_display_text(info: UnsubscribeInfo): string {
  switch (info.method) {
    case "one-click":
      return "One-click unsubscribe available";
    case "link":
      return "Unsubscribe link found";
    case "mailto":
      return "Email unsubscribe available";
    default:
      return "";
  }
}

export function get_sender_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);

  return match ? match[1].toLowerCase() : email.toLowerCase();
}
