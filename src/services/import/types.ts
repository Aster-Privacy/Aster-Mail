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
export interface ParsedAttachment {
  filename: string;
  content_type: string;
  content: Uint8Array;
  size: number;
}

export interface ParsedEmail {
  message_id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  html_body: string | null;
  text_body: string | null;
  attachments: ParsedAttachment[];
  raw_headers: Record<string, string>;
}

export interface ParseProgress {
  current: number;
  total: number;
  percentage: number;
}

export type ParseProgressCallback = (progress: ParseProgress) => void;

export interface ParseResult {
  emails: ParsedEmail[];
  errors: string[];
  warnings: string[];
}

export interface PstAttachment {
  filename?: string;
  fileInputStream?: { read(): Uint8Array | number[] };
  mimeTag?: string;
  attachSize?: number;
}

export interface PstMessage {
  internetMessageId?: string;
  senderEmailAddress?: string;
  senderName?: string;
  displayTo?: string;
  displayCC?: string;
  subject?: string;
  clientSubmitTime?: Date;
  messageDeliveryTime?: Date;
  bodyHTML?: string;
  body?: string;
  hasAttachments?: boolean;
  numberOfAttachments?: number;
  getAttachment(index: number): PstAttachment;
}

export interface PstFolder {
  contentCount: number;
  hasSubfolders: boolean;
  getNextChild(): PstMessage | null;
  getSubFolders(): PstFolder[];
}

export interface CsvRow {
  [key: string]: string;
}

export const MAX_FILE_SIZE = 500 * 1024 * 1024;
export const MAX_SINGLE_EMAIL_SIZE = 50 * 1024 * 1024;
