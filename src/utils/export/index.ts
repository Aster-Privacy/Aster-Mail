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
export {
  serialize_envelope,
  serialize_envelope_to_bytes,
  type ExportAttachment,
  type SerializeOptions,
} from "./rfc5322";
export {
  frame_mbox_message,
  write_mbox_stream,
  type MessageInput,
  type MboxOptions,
} from "./mbox";
export { sanitize_eml_filename, FilenameAllocator } from "./filename";
export { generate_message_id } from "./headers";
export {
  serialize_vcard,
  serialize_vcards,
  type VCardContact,
} from "./vcard";
