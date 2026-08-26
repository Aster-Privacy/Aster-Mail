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
import type { TranslationKey } from "@/lib/i18n/types";

export type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export type SearchOperatorType =
  | "from"
  | "to"
  | "subject"
  | "has"
  | "is"
  | "in"
  | "before"
  | "after"
  | "label"
  | "folder"
  | "date"
  | "filename"
  | "attachment"
  | "larger"
  | "smaller"
  | "size"
  | "id";

export type HasOperatorValue =
  | "attachment"
  | "attachments"
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "video"
  | "audio"
  | "archive";

export type IsOperatorValue = "unread" | "read" | "starred" | "unstarred";
export type InOperatorValue =
  | "inbox"
  | "sent"
  | "trash"
  | "drafts"
  | "spam"
  | "archive"
  | "all"
  | "anywhere";

export type DateShortcut =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month";

export interface ParsedOperator {
  type: SearchOperatorType;
  value: string;
  raw: string;
  negated: boolean;
}

export interface ParsedSearchQuery {
  text_query: string;
  operators: ParsedOperator[];
}

export interface ActiveFilter {
  id: string;
  type: SearchOperatorType | "quick";
  label: string;
  value: string;
  removable: boolean;
}

export type SortOption = "relevance" | "date_newest" | "date_oldest" | "sender";

export interface SearchScope {
  type: "all" | "current_folder";
  folder?: string;
}

export const OPERATOR_REGEX =
  /(?:^|\s)(-)?(?:NOT\s+)?(from|to|subject|has|is|in|before|after|label|folder|date|filename|attachment|larger|smaller|size|id):("([^"]+)"|(\S+))/gi;

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const SIZE_REGEX = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;

export const SIZE_RANGE_REGEX =
  /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?-(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;

export const ATTACHMENT_MIME_MAP: Record<string, string[]> = {
  pdf: ["application/pdf"],
  image: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
  ],
  document: [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "text/plain",
    "text/rtf",
    "application/rtf",
  ],
  spreadsheet: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/csv",
  ],
  video: [
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/quicktime",
    "video/x-msvideo",
  ],
  audio: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp3",
    "audio/aac",
    "audio/flac",
  ],
  archive: [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
  ],
};
