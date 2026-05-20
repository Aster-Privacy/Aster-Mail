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
import { api_client } from "@/services/api/client";

export type ExportAuditKind = "started" | "completed" | "aborted";

export interface ExportAuditEvent {
  kind: ExportAuditKind;
  count: number;
  total_bytes: number;
  format: "mbox" | "eml_dir";
}

export async function emit_export_event(event: ExportAuditEvent): Promise<void> {
  try {
    await api_client.post("/account/v1/events/export", {
      kind: event.kind,
      count: event.count,
      total_bytes: event.total_bytes,
      format: event.format,
      ts: new Date().toISOString(),
    });
  } catch {
    // audit failure must never block the user-facing export
  }
}
