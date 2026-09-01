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
import { useState, useEffect, useCallback, useRef } from "react";

import {
  EditorState,
  IMAGE_MAGIC_BYTES,
  MAX_IMAGE_SIZE,
  SignatureMode,
  escape_html,
  has_editor_content,
  initial_editor_state,
  validate_image_magic_bytes,
} from "./helpers";

import { ignore_error } from "@/lib/ignore_error";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { use_editor } from "@/hooks/use_editor";
import { MAX_HORIZONTAL_RULES } from "@/hooks/use_editor_format";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_signatures,
  create_signature,
  update_signature,
  delete_signature,
  set_default_signature,
  type DecryptedSignature,
  type SignatureFormData,
} from "@/services/api/signatures";
import { fetch_my_badges } from "@/services/api/user";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  use_sender_aliases,
  is_signature_bindable_sender,
} from "@/hooks/use_sender_aliases";

export function use_signature_section() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences, update_preference } = use_preferences();
  const { reload_signatures: reload_context_signatures } = use_signatures();
  const { sender_options } = use_sender_aliases();
  const sender_aliases = sender_options.filter(is_signature_bindable_sender);
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";
  const [signatures, set_signatures] = useState<DecryptedSignature[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [has_badges, set_has_badges] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch_my_badges()
      .then((r) => {
        if (cancelled) return;
        if (r.data && r.data.length > 0) set_has_badges(true);
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/signature_section/use_signature_section:badges",
          caught,
        ),
      );

    return () => {
      cancelled = true;
    };
  }, []);
  const [error, set_error] = useState<string | null>(null);
  const [editor_error, set_editor_error] = useState<string | null>(null);
  const [has_unreadable, set_has_unreadable] = useState(false);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [confirm_delete_id, set_confirm_delete_id] = useState<string | null>(
    null,
  );
  const editor_div_ref = useRef<HTMLDivElement>(null);
  const image_input_ref = useRef<HTMLInputElement>(null);
  const [confirm_discard_open, set_confirm_discard_open] = useState(false);
  const editor_baseline_ref = useRef<string>("");
  const [show_link_dialog, set_show_link_dialog] = useState(false);
  const [selected_text_for_link, set_selected_text_for_link] = useState("");

  const rich_editor = use_editor({
    editor_ref: editor_div_ref,
    on_change: (html: string) => {
      set_editor((prev) => ({ ...prev, content: html }));
    },
    enable_rich_paste: true,
    enable_keyboard_shortcuts: true,
  });

  const name_invalid = editor.show_validation && !editor.name.trim();
  const content_invalid =
    editor.show_validation && !has_editor_content(editor.content);

  const handle_image_upload = useCallback(
    (file: File) => {
      if (!IMAGE_MAGIC_BYTES[file.type]) {
        show_toast(t("settings.signature_image_invalid"), "error");

        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        show_toast(t("settings.signature_image_too_large"), "error");

        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        show_toast(t("settings.signature_image_failed"), "error");
      };

      reader.onload = () => {
        const data_url = reader.result as string;
        let arr_buf: ArrayBuffer;

        try {
          arr_buf = Uint8Array.from(atob(data_url.split(",")[1] || ""), (c) =>
            c.charCodeAt(0),
          ).buffer;
        } catch {
          show_toast(t("settings.signature_image_failed"), "error");

          return;
        }

        if (!validate_image_magic_bytes(arr_buf, file.type)) {
          show_toast(t("settings.signature_image_invalid"), "error");

          return;
        }

        rich_editor.insert_html(
          `<img src="${data_url}" style="max-width: min(100%, 480px); height: auto; border-radius: 6px; display: block; margin: 8px 0;" />`,
        );
      };
      reader.readAsDataURL(file);
    },
    [rich_editor, t],
  );

  const handle_insert_horizontal_rule = useCallback(() => {
    if (!rich_editor.insert_horizontal_rule()) {
      show_toast(
        t("settings.signature_divider_limit").replace(
          "{{count}}",
          String(MAX_HORIZONTAL_RULES),
        ),
        "warning",
      );
    }
  }, [rich_editor, t]);

  const handle_open_link_dialog = () => {
    rich_editor.save_selection();
    set_selected_text_for_link(window.getSelection()?.toString() || "");
    set_show_link_dialog(true);
  };
  const [local_mode, set_local_mode] = useState<SignatureMode>(
    (preferences.signature_mode as SignatureMode) || "auto",
  );
  const [local_placement, set_local_placement] = useState<"below" | "above">(
    preferences.signature_placement || "above",
  );

  useEffect(() => {
    set_local_mode((preferences.signature_mode as SignatureMode) || "auto");
  }, [preferences.signature_mode]);

  useEffect(() => {
    set_local_placement(preferences.signature_placement || "above");
  }, [preferences.signature_placement]);

  const load_signatures = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    const response = await list_signatures();

    if (response.error) {
      set_error(response.error);
    } else if (response.data) {
      set_signatures(response.data.signatures);
      set_has_unreadable(
        typeof response.data.total === "number" &&
          response.data.total > response.data.signatures.length,
      );
    }

    set_is_loading(false);
    set_is_initial_load(false);
  }, []);

  useEffect(() => {
    load_signatures();
  }, [load_signatures]);

  const handle_mode_change = (mode: SignatureMode) => {
    set_local_mode(mode);
    update_preference("signature_mode", mode, true);
  };

  const handle_placement_change = (placement: "below" | "above") => {
    set_local_placement(placement);
    update_preference("signature_placement", placement, true);
  };

  const open_create_editor = () => {
    set_editor_error(null);
    editor_baseline_ref.current = "";
    set_editor({
      is_open: true,
      editing_id: null,
      name: "",
      content: "",
      is_saving: false,
      alias_id: null,
      placement: null,
      show_validation: false,
    });
    requestAnimationFrame(() => {
      editor_baseline_ref.current = JSON.stringify({
        name: "",
        alias_id: null,
        placement: null,
        content: rich_editor.get_html(),
      });
    });
  };

  const open_edit_editor = (signature: DecryptedSignature) => {
    set_editor_error(null);
    set_editor({
      is_open: true,
      editing_id: signature.id,
      name: signature.name,
      content: signature.content,
      is_saving: false,
      alias_id: signature.alias_id,
      placement: signature.placement,
      show_validation: false,
    });
    editor_baseline_ref.current = "";
    requestAnimationFrame(() => {
      if (editor_div_ref.current) {
        const html = signature.is_html
          ? signature.content
          : escape_html(signature.content).replace(/\n/g, "<br>");

        rich_editor.set_html(html);
      }
      editor_baseline_ref.current = JSON.stringify({
        name: signature.name,
        alias_id: signature.alias_id,
        placement: signature.placement,
        content: rich_editor.get_html(),
      });
    });
  };

  const close_editor = () => {
    set_editor_error(null);
    editor_baseline_ref.current = "";
    set_confirm_discard_open(false);
    set_editor(initial_editor_state);
  };

  const request_close_editor = () => {
    if (editor.is_saving) return;

    const current = JSON.stringify({
      name: editor.name,
      alias_id: editor.alias_id,
      placement: editor.placement,
      content: rich_editor.get_html(),
    });

    if (
      editor_baseline_ref.current !== "" &&
      current !== editor_baseline_ref.current
    ) {
      set_confirm_discard_open(true);

      return;
    }

    close_editor();
  };

  const handle_save = async () => {
    const html_content = rich_editor.get_html();

    if (!editor.name.trim() || !has_editor_content(html_content)) {
      set_editor((prev) => ({ ...prev, show_validation: true }));

      return;
    }

    set_editor_error(null);
    set_editor((prev) => ({ ...prev, is_saving: true }));

    const temp = document.createElement("div");

    temp.innerHTML = html_content.trim();
    const has_rich_content =
      temp.querySelector("img, a, b, strong, i, em, u, table, hr") !== null ||
      temp.querySelector("[style]") !== null;

    temp.querySelectorAll("br").forEach((br) => {
      br.replaceWith("\n");
    });
    temp.querySelectorAll("div, p").forEach((block) => {
      block.before("\n");
      block.replaceWith(...block.childNodes);
    });
    const plain_text = (temp.textContent || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const form_data: SignatureFormData = {
      name: editor.name.trim(),
      content: has_rich_content ? html_content.trim() : plain_text,
      is_html: has_rich_content,
      alias_id: editor.alias_id,
      placement: editor.placement,
    };

    if (editor.editing_id) {
      const response = await update_signature(editor.editing_id, form_data);

      if (response.error) {
        set_editor_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      set_signatures((prev) =>
        prev.map((sig) =>
          sig.id === editor.editing_id
            ? {
                ...sig,
                name: form_data.name,
                content: form_data.content,
                is_html: has_rich_content,
                alias_id: form_data.alias_id ?? null,
                placement: form_data.placement ?? null,
              }
            : sig,
        ),
      );
      reload_context_signatures();
    } else {
      const is_first = signatures.length === 0;
      const response = await create_signature(form_data, is_first);

      if (response.error) {
        set_editor_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      if (response.data) {
        const new_signature: DecryptedSignature = {
          id: response.data.id,
          name: form_data.name,
          content: form_data.content,
          is_default: is_first,
          is_html: has_rich_content,
          alias_id: form_data.alias_id ?? null,
          placement: form_data.placement ?? null,
          created_at: response.data.created_at,
          updated_at: response.data.created_at,
        };

        set_signatures((prev) => [...prev, new_signature]);
        reload_context_signatures();
      }
    }

    close_editor();
  };

  const handle_delete = async (id: string) => {
    set_deleting_id(id);
    const response = await delete_signature(id);

    if (response.error) {
      set_error(response.error);
      set_deleting_id(null);

      return;
    }

    const remaining = signatures.filter((sig) => sig.id !== id);
    const needs_promotion =
      remaining.length > 0 && !remaining.some((sig) => sig.is_default);

    if (needs_promotion) {
      const promoted = remaining[0];
      const promote_response = await set_default_signature(promoted.id);

      if (promote_response.error) {
        set_error(promote_response.error);
        load_signatures();
        set_deleting_id(null);

        return;
      }

      set_signatures(
        remaining.map((sig) => ({
          ...sig,
          is_default: sig.id === promoted.id,
        })),
      );
    } else {
      set_signatures(remaining);
    }

    reload_context_signatures();
    set_deleting_id(null);
  };

  const handle_set_default = async (id: string) => {
    set_signatures((prev) =>
      prev.map((sig) => ({ ...sig, is_default: sig.id === id })),
    );

    const response = await set_default_signature(id);

    if (response.error) {
      set_error(response.error);
      load_signatures();

      return;
    }

    reload_context_signatures();
  };

  return {
    t,
    reduce_motion,
    preferences,
    update_preference,
    sender_aliases,
    is_paid_plan,
    signatures,
    is_loading,
    is_initial_load,
    has_badges,
    error,
    set_error,
    editor_error,
    has_unreadable,
    editor,
    set_editor,
    deleting_id,
    confirm_delete_id,
    set_confirm_delete_id,
    editor_div_ref,
    image_input_ref,
    show_link_dialog,
    set_show_link_dialog,
    selected_text_for_link,
    rich_editor,
    name_invalid,
    content_invalid,
    handle_image_upload,
    handle_insert_horizontal_rule,
    handle_open_link_dialog,
    local_mode,
    local_placement,
    handle_mode_change,
    handle_placement_change,
    open_create_editor,
    open_edit_editor,
    close_editor,
    request_close_editor,
    confirm_discard_open,
    set_confirm_discard_open,
    handle_save,
    handle_delete,
    handle_set_default,
  };
}
