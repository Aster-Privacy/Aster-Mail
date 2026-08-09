//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export interface InboundAttachmentEntry {
  key: string;
  filename?: string;
  content_type?: string;
  content_id?: string;
  size?: number;
}

const registry = new Map<string, InboundAttachmentEntry>();

const registry_key = (mail_item_id: string, seq: number): string =>
  `${mail_item_id}:${seq}`;

export const register_attachment_entry = (
  mail_item_id: string,
  seq: number,
  entry: InboundAttachmentEntry,
): void => {
  registry.set(registry_key(mail_item_id, seq), entry);
};

export const get_attachment_entry = (
  mail_item_id: string,
  seq: number,
): InboundAttachmentEntry | null =>
  registry.get(registry_key(mail_item_id, seq)) ?? null;

export const get_attachment_key = (
  mail_item_id: string,
  seq: number,
): string => registry.get(registry_key(mail_item_id, seq))?.key ?? "";

export const clear_attachment_keys = (): void => {
  registry.clear();
};
