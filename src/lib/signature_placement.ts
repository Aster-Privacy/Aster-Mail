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
export type SignaturePlacementValue = "above" | "below";

export function resolve_signature_placement(
  signature_placement: string | null | undefined,
  preference: string | null | undefined,
): SignaturePlacementValue {
  if (signature_placement === "above" || signature_placement === "below") {
    return signature_placement;
  }
  if (preference === "above" || preference === "below") return preference;

  return "below";
}

export function assemble_reply_with_placement(
  reply_body: string,
  quoted_content: string,
  resolve_placement: (signature_id: string | null) => SignaturePlacementValue,
): string {
  if (!quoted_content || !reply_body) return reply_body + quoted_content;

  if (typeof DOMParser === "undefined") return reply_body + quoted_content;

  const parsed = new DOMParser().parseFromString(
    `<div id="aster_placement_root">${reply_body}</div>`,
    "text/html",
  );
  const root = parsed.getElementById("aster_placement_root");

  if (!root) return reply_body + quoted_content;
  const blocks = root.querySelectorAll('[data-aster-signature="1"]');
  const signature = blocks[blocks.length - 1];

  if (!signature) return reply_body + quoted_content;

  if (
    resolve_placement(signature.getAttribute("data-aster-signature-id")) !==
    "below"
  ) {
    return reply_body + quoted_content;
  }
  const signature_html = signature.outerHTML;

  signature.remove();

  return root.innerHTML + quoted_content + signature_html;
}
