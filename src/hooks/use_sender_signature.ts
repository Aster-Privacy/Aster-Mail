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
import type { DecryptedSignature } from "@/services/api/signatures";

import { useCallback, useEffect, useRef, useState } from "react";

import { use_signatures } from "@/contexts/signatures_context";
import {
  is_signature_bindable_sender_type,
  type SenderOption,
} from "@/hooks/use_sender_aliases";
import { sanitize_html } from "@/lib/html_sanitizer";
import { get_compose_sanitize_options } from "@/lib/compose_image_sources";
import { insert_signature_node } from "@/lib/signature_html";

interface UseSenderSignatureOptions {
  editor_ref: React.RefObject<HTMLElement | null>;
  selected_sender: SenderOption | null;
  enabled: boolean;
  on_swapped: (editor: HTMLElement) => void;
}

interface UseSenderSignatureReturn {
  signature_ref: React.RefObject<DecryptedSignature | null>;
  mark_signature_applied: (signature: DecryptedSignature | null) => void;
  reset_signature: () => void;
}

export function use_sender_signature({
  editor_ref,
  selected_sender,
  enabled,
  on_swapped,
}: UseSenderSignatureOptions): UseSenderSignatureReturn {
  const { default_signature, get_formatted_signature, resolve_signature } =
    use_signatures();
  const alias_id =
    selected_sender && is_signature_bindable_sender_type(selected_sender.type)
      ? selected_sender.id
      : null;
  const signature = resolve_signature(alias_id) ?? default_signature;
  const signature_ref = useRef<DecryptedSignature | null>(signature);
  const applied_id_ref = useRef<string | null>(null);
  const on_swapped_ref = useRef(on_swapped);
  const [is_applied, set_is_applied] = useState(false);

  signature_ref.current = signature;
  on_swapped_ref.current = on_swapped;

  const mark_signature_applied = useCallback(
    (applied: DecryptedSignature | null) => {
      applied_id_ref.current = applied?.id ?? null;
      set_is_applied(true);
    },
    [],
  );

  const reset_signature = useCallback(() => {
    applied_id_ref.current = null;
    set_is_applied(false);
  }, []);

  useEffect(() => {
    if (!enabled || !is_applied || !signature) return;
    if (applied_id_ref.current === signature.id) return;

    const editor = editor_ref.current;

    if (!editor) return;

    const existing = editor.querySelector<HTMLElement>(
      "[data-aster-signature='1']",
    );
    const had_signature = applied_id_ref.current !== null;

    applied_id_ref.current = signature.id;

    if (!existing && had_signature) return;

    const sanitized = sanitize_html(
      get_formatted_signature(signature),
      get_compose_sanitize_options(),
    );
    const wrapper = document.createElement("div");

    wrapper.innerHTML = sanitized.html;
    const new_node = wrapper.firstElementChild;

    if (!new_node) return;

    if (existing) {
      existing.replaceWith(new_node);
    } else {
      insert_signature_node(editor, new_node);
    }
    on_swapped_ref.current(editor);
  }, [enabled, is_applied, signature, editor_ref, get_formatted_signature]);

  return { signature_ref, mark_signature_applied, reset_signature };
}
