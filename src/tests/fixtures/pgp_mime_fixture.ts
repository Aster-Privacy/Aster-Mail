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
export interface FixtureFile {
  filename_header: string;
  content_type: string;
  data: Uint8Array;
  encoding?: "base64" | "quoted-printable";
  disposition?: "attachment" | "inline";
  content_id?: string;
}

export function bytes_to_base64_lines(data: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }

  return (btoa(binary).match(/.{1,76}/g) ?? []).join("\r\n");
}

export function bytes_to_quoted_printable(data: Uint8Array): string {
  let out = "";
  let line = 0;

  for (const byte of data) {
    const literal =
      (byte >= 33 && byte <= 126 && byte !== 61) || byte === 32
        ? String.fromCharCode(byte)
        : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;

    if (line + literal.length > 75) {
      out += "=\r\n";
      line = 0;
    }

    out += literal;
    line += literal.length;
  }

  return out;
}

export function file_part(file: FixtureFile): string {
  const encoding = file.encoding ?? "base64";
  const body =
    encoding === "base64"
      ? bytes_to_base64_lines(file.data)
      : bytes_to_quoted_printable(file.data);
  const headers = [
    `Content-Type: ${file.content_type}`,
    `Content-Disposition: ${file.disposition ?? "attachment"}; ${file.filename_header}`,
    `Content-Transfer-Encoding: ${encoding}`,
  ];

  if (file.content_id) headers.push(`Content-ID: <${file.content_id}>`);

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function multipart(
  subtype: string,
  boundary: string,
  parts: string[],
  extra_params = "",
): string {
  return [
    `Content-Type: multipart/${subtype}; boundary="${boundary}"${extra_params}`,
    "",
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function text_part(subtype: "plain" | "html", text: string): string {
  return `Content-Type: text/${subtype}; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${text}`;
}

export function pseudo_random_bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0 || 1;

  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out[i] = state & 0xff;
  }

  return out;
}

export async function sha256_hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data instanceof Uint8Array ? data : new Uint8Array(data),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
