import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  lazy,
  Suspense,
} from "react";

import { get_email_logo_url } from "@/lib/logo_service";

const ProfilePopup = lazy(() =>
  import("@/components/profile_popup").then((mod) => ({
    default: mod.ProfilePopup,
  })),
);

interface ProfileAvatarProps {
  name: string;
  email?: string;
  image_url?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  use_domain_logo?: boolean;
  clickable?: boolean;
  on_compose?: (email: string) => void;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 96,
};

const DEFAULT_PROFILE_IMAGE = "/profile.png";
const ASTER_MAIL_DOMAINS = new Set(["aster.cx", "astermail.org"]);
const MAX_CACHE_SIZE = 500;

const failed_emails = new Set<string>();
const failed_domain_logos = new Set<string>();

function add_to_cache(cache: Set<string>, key: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const first = cache.values().next().value;

    if (first) cache.delete(first);
  }
  cache.add(key);
}

function compute_md5(input: string): string {
  const add = (a: number, b: number): number => {
    const l = (a & 0xffff) + (b & 0xffff);

    return ((((a >> 16) + (b >> 16) + (l >> 16)) << 16) | (l & 0xffff)) >>> 0;
  };

  const rotl = (n: number, b: number): number =>
    ((n << b) | (n >>> (32 - b))) >>> 0;

  const cmn = (
    q: number,
    a: number,
    b: number,
    x: number,
    s: number,
    t: number,
  ): number => add(rotl(add(add(a, q), add(x, t)), s), b);

  const ff = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) => cmn((b & c) | (~b & d), a, b, x, s, t);

  const gg = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) => cmn((b & d) | (c & ~d), a, b, x, s, t);

  const hh = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) => cmn(b ^ c ^ d, a, b, x, s, t);

  const ii = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) => cmn(c ^ (b | ~d), a, b, x, s, t);

  const bytes: number[] = [];

  for (let i = 0; i < input.length; i++) {
    bytes.push(input.charCodeAt(i) & 0xff);
  }

  const orig_len = bytes.length;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  const bit_len = orig_len * 8;

  bytes.push(
    bit_len & 0xff,
    (bit_len >> 8) & 0xff,
    (bit_len >> 16) & 0xff,
    (bit_len >> 24) & 0xff,
    0,
    0,
    0,
    0,
  );

  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let i = 0; i < bytes.length; i += 64) {
    const w: number[] = [];

    for (let j = 0; j < 16; j++) {
      w[j] =
        bytes[i + j * 4] |
        (bytes[i + j * 4 + 1] << 8) |
        (bytes[i + j * 4 + 2] << 16) |
        (bytes[i + j * 4 + 3] << 24);
    }

    const [aa, bb, cc, dd] = [a, b, c, d];

    a = ff(a, b, c, d, w[0], 7, 0xd76aa478);
    d = ff(d, a, b, c, w[1], 12, 0xe8c7b756);
    c = ff(c, d, a, b, w[2], 17, 0x242070db);
    b = ff(b, c, d, a, w[3], 22, 0xc1bdceee);
    a = ff(a, b, c, d, w[4], 7, 0xf57c0faf);
    d = ff(d, a, b, c, w[5], 12, 0x4787c62a);
    c = ff(c, d, a, b, w[6], 17, 0xa8304613);
    b = ff(b, c, d, a, w[7], 22, 0xfd469501);
    a = ff(a, b, c, d, w[8], 7, 0x698098d8);
    d = ff(d, a, b, c, w[9], 12, 0x8b44f7af);
    c = ff(c, d, a, b, w[10], 17, 0xffff5bb1);
    b = ff(b, c, d, a, w[11], 22, 0x895cd7be);
    a = ff(a, b, c, d, w[12], 7, 0x6b901122);
    d = ff(d, a, b, c, w[13], 12, 0xfd987193);
    c = ff(c, d, a, b, w[14], 17, 0xa679438e);
    b = ff(b, c, d, a, w[15], 22, 0x49b40821);

    a = gg(a, b, c, d, w[1], 5, 0xf61e2562);
    d = gg(d, a, b, c, w[6], 9, 0xc040b340);
    c = gg(c, d, a, b, w[11], 14, 0x265e5a51);
    b = gg(b, c, d, a, w[0], 20, 0xe9b6c7aa);
    a = gg(a, b, c, d, w[5], 5, 0xd62f105d);
    d = gg(d, a, b, c, w[10], 9, 0x02441453);
    c = gg(c, d, a, b, w[15], 14, 0xd8a1e681);
    b = gg(b, c, d, a, w[4], 20, 0xe7d3fbc8);
    a = gg(a, b, c, d, w[9], 5, 0x21e1cde6);
    d = gg(d, a, b, c, w[14], 9, 0xc33707d6);
    c = gg(c, d, a, b, w[3], 14, 0xf4d50d87);
    b = gg(b, c, d, a, w[8], 20, 0x455a14ed);
    a = gg(a, b, c, d, w[13], 5, 0xa9e3e905);
    d = gg(d, a, b, c, w[2], 9, 0xfcefa3f8);
    c = gg(c, d, a, b, w[7], 14, 0x676f02d9);
    b = gg(b, c, d, a, w[12], 20, 0x8d2a4c8a);

    a = hh(a, b, c, d, w[5], 4, 0xfffa3942);
    d = hh(d, a, b, c, w[8], 11, 0x8771f681);
    c = hh(c, d, a, b, w[11], 16, 0x6d9d6122);
    b = hh(b, c, d, a, w[14], 23, 0xfde5380c);
    a = hh(a, b, c, d, w[1], 4, 0xa4beea44);
    d = hh(d, a, b, c, w[4], 11, 0x4bdecfa9);
    c = hh(c, d, a, b, w[7], 16, 0xf6bb4b60);
    b = hh(b, c, d, a, w[10], 23, 0xbebfbc70);
    a = hh(a, b, c, d, w[13], 4, 0x289b7ec6);
    d = hh(d, a, b, c, w[0], 11, 0xeaa127fa);
    c = hh(c, d, a, b, w[3], 16, 0xd4ef3085);
    b = hh(b, c, d, a, w[6], 23, 0x04881d05);
    a = hh(a, b, c, d, w[9], 4, 0xd9d4d039);
    d = hh(d, a, b, c, w[12], 11, 0xe6db99e5);
    c = hh(c, d, a, b, w[15], 16, 0x1fa27cf8);
    b = hh(b, c, d, a, w[2], 23, 0xc4ac5665);

    a = ii(a, b, c, d, w[0], 6, 0xf4292244);
    d = ii(d, a, b, c, w[7], 10, 0x432aff97);
    c = ii(c, d, a, b, w[14], 15, 0xab9423a7);
    b = ii(b, c, d, a, w[5], 21, 0xfc93a039);
    a = ii(a, b, c, d, w[12], 6, 0x655b59c3);
    d = ii(d, a, b, c, w[3], 10, 0x8f0ccc92);
    c = ii(c, d, a, b, w[10], 15, 0xffeff47d);
    b = ii(b, c, d, a, w[1], 21, 0x85845dd1);
    a = ii(a, b, c, d, w[8], 6, 0x6fa87e4f);
    d = ii(d, a, b, c, w[15], 10, 0xfe2ce6e0);
    c = ii(c, d, a, b, w[6], 15, 0xa3014314);
    b = ii(b, c, d, a, w[13], 21, 0x4e0811a1);
    a = ii(a, b, c, d, w[4], 6, 0xf7537e82);
    d = ii(d, a, b, c, w[11], 10, 0xbd3af235);
    c = ii(c, d, a, b, w[2], 15, 0x2ad7d2bb);
    b = ii(b, c, d, a, w[9], 21, 0xeb86d391);

    a = add(a, aa);
    b = add(b, bb);
    c = add(c, cc);
    d = add(d, dd);
  }

  const hex = (n: number): string => {
    let s = "";

    for (let i = 0; i < 4; i++)
      s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, "0");

    return s;
  };

  return hex(a) + hex(b) + hex(c) + hex(d);
}

function get_gravatar_url(email: string, size: number): string {
  return `https://www.gravatar.com/avatar/${compute_md5(email.trim().toLowerCase())}?s=${size}&d=404`;
}

function extract_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);

  return match ? match[1].toLowerCase() : "";
}

export function ProfileAvatar({
  name,
  email,
  image_url,
  size = "md",
  className = "",
  use_domain_logo = false,
  clickable = false,
  on_compose,
}: ProfileAvatarProps) {
  const [image_error, set_image_error] = useState(false);
  const [domain_logo_error, set_domain_logo_error] = useState(false);
  const [profile_open, set_profile_open] = useState(false);

  const pixel_size = SIZE_MAP[size];
  const domain = useMemo(() => (email ? extract_domain(email) : ""), [email]);
  const is_aster_mail = ASTER_MAIL_DOMAINS.has(domain);

  useEffect(() => {
    set_image_error(false);
    set_domain_logo_error(failed_domain_logos.has(domain));
  }, [email, image_url, domain]);

  const domain_logo_url = useMemo(() => {
    if (
      !use_domain_logo ||
      !email ||
      domain_logo_error ||
      failed_domain_logos.has(domain)
    )
      return null;

    return get_email_logo_url(email);
  }, [use_domain_logo, email, domain_logo_error, domain]);

  const gravatar_url = useMemo(() => {
    if (!email || failed_emails.has(email.toLowerCase())) return null;

    return get_gravatar_url(email, pixel_size * 2);
  }, [email, pixel_size]);

  const handle_domain_logo_error = useCallback(() => {
    set_domain_logo_error(true);
    if (domain) add_to_cache(failed_domain_logos, domain);
  }, [domain]);

  const handle_error = useCallback(() => {
    set_image_error(true);
    if (email) add_to_cache(failed_emails, email.toLowerCase());
  }, [email]);

  const actual_src = useMemo(() => {
    if (is_aster_mail) return "/mail_logo.png";
    if (image_url && !image_error) return image_url;
    if (domain_logo_url && !domain_logo_error) return domain_logo_url;
    if (gravatar_url && !image_error) return gravatar_url;

    return DEFAULT_PROFILE_IMAGE;
  }, [
    is_aster_mail,
    image_url,
    domain_logo_url,
    gravatar_url,
    image_error,
    domain_logo_error,
  ]);

  const error_handler = useMemo(() => {
    if (is_aster_mail) return undefined;
    if (image_url && !image_error) return handle_error;
    if (domain_logo_url && !domain_logo_error) return handle_domain_logo_error;
    if (gravatar_url && !image_error) return handle_error;

    return undefined;
  }, [
    is_aster_mail,
    image_url,
    domain_logo_url,
    gravatar_url,
    image_error,
    domain_logo_error,
    handle_error,
    handle_domain_logo_error,
  ]);

  const handle_click = useCallback(
    (e: React.MouseEvent) => {
      if (!clickable || !email) return;
      e.preventDefault();
      e.stopPropagation();
      set_profile_open(true);
    },
    [clickable, email],
  );

  const img_element = (
    <img
      alt={name}
      className={`rounded-full flex-shrink-0 object-cover ${className}`}
      crossOrigin="anonymous"
      draggable={false}
      height={pixel_size}
      referrerPolicy="no-referrer"
      src={actual_src}
      style={{ userSelect: "none" }}
      width={pixel_size}
      onError={error_handler}
    />
  );

  if (clickable && email) {
    return (
      <>
        <button
          className="rounded-full flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          type="button"
          onClick={handle_click}
        >
          {img_element}
        </button>
        {profile_open && (
          <Suspense fallback={null}>
            <ProfilePopup
              email={email}
              is_open={profile_open}
              name={name}
              on_close={() => set_profile_open(false)}
              on_compose={on_compose}
            />
          </Suspense>
        )}
      </>
    );
  }

  return img_element;
}
