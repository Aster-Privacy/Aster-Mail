import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import {
  list_signatures,
  create_signature,
  update_signature,
  delete_signature,
  set_default_signature,
  type DecryptedSignature,
  type SignatureFormData,
} from "@/services/api/signatures";

type SignatureMode = "disabled" | "auto" | "manual";

interface EditorState {
  is_open: boolean;
  editing_id: string | null;
  name: string;
  content: string;
  is_saving: boolean;
}

const initial_editor_state: EditorState = {
  is_open: false,
  editing_id: null,
  name: "",
  content: "",
  is_saving: false,
};

export function SignatureSection() {
  const { preferences, update_preference } = use_preferences();
  const { reload_signatures: reload_context_signatures } = use_signatures();
  const [signatures, set_signatures] = useState<DecryptedSignature[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [local_mode, set_local_mode] = useState<SignatureMode>(
    (preferences.signature_mode as SignatureMode) || "auto",
  );
  const [local_placement, set_local_placement] = useState<"below" | "above">(
    preferences.signature_placement || "below",
  );

  useEffect(() => {
    set_local_mode((preferences.signature_mode as SignatureMode) || "auto");
  }, [preferences.signature_mode]);

  useEffect(() => {
    set_local_placement(preferences.signature_placement || "below");
  }, [preferences.signature_placement]);

  const load_signatures = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    const response = await list_signatures();

    if (response.error) {
      set_error(response.error);
    } else if (response.data) {
      set_signatures(response.data.signatures);
    }

    set_is_loading(false);
  }, []);

  useEffect(() => {
    load_signatures();
  }, [load_signatures]);

  const handle_mode_change = (mode: SignatureMode) => {
    set_local_mode(mode);
    update_preference("signature_mode", mode);
  };

  const handle_placement_change = (placement: "below" | "above") => {
    set_local_placement(placement);
    update_preference("signature_placement", placement);
  };

  const open_create_editor = () => {
    set_editor({
      is_open: true,
      editing_id: null,
      name: "",
      content: "",
      is_saving: false,
    });
  };

  const open_edit_editor = (signature: DecryptedSignature) => {
    set_editor({
      is_open: true,
      editing_id: signature.id,
      name: signature.name,
      content: signature.content,
      is_saving: false,
    });
  };

  const close_editor = () => {
    set_editor(initial_editor_state);
  };

  const handle_save = async () => {
    if (!editor.name.trim() || !editor.content.trim()) return;

    set_editor((prev) => ({ ...prev, is_saving: true }));

    const form_data: SignatureFormData = {
      name: editor.name.trim(),
      content: editor.content.trim(),
      is_html: false,
    };

    if (editor.editing_id) {
      const response = await update_signature(editor.editing_id, form_data);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      set_signatures((prev) =>
        prev.map((sig) =>
          sig.id === editor.editing_id
            ? { ...sig, name: form_data.name, content: form_data.content }
            : sig,
        ),
      );
      reload_context_signatures();
    } else {
      const is_first = signatures.length === 0;
      const response = await create_signature(form_data, is_first);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      if (response.data) {
        const new_signature: DecryptedSignature = {
          id: response.data.id,
          name: form_data.name,
          content: form_data.content,
          is_default: is_first,
          is_html: false,
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
    } else {
      set_signatures((prev) => {
        const filtered = prev.filter((sig) => sig.id !== id);

        if (filtered.length > 0 && !filtered.some((s) => s.is_default)) {
          filtered[0].is_default = true;
        }

        return filtered;
      });
      reload_context_signatures();
    }

    set_deleting_id(null);
  };

  const handle_set_default = async (id: string) => {
    set_signatures((prev) =>
      prev.map((sig) => ({ ...sig, is_default: sig.id === id })),
    );
    reload_context_signatures();

    const response = await set_default_signature(id);

    if (response.error) {
      set_error(response.error);
      load_signatures();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-base font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Email Signature
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Create and manage your email signatures. All signatures are end-to-end
          encrypted.
        </p>

        <div className="mb-3">
          <p
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Signature Mode
          </p>
          <div
            className="inline-flex p-1 rounded-lg"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            {[
              { value: "disabled", label: "Off" },
              { value: "auto", label: "Auto" },
              { value: "manual", label: "Manual" },
            ].map((option) => {
              const is_selected = local_mode === option.value;

              return (
                <button
                  key={option.value}
                  className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
                  style={{
                    backgroundColor: is_selected
                      ? "var(--bg-primary)"
                      : "transparent",
                    color: is_selected
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    boxShadow: is_selected
                      ? "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)"
                      : "none",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handle_mode_change(option.value as SignatureMode);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            {local_mode === "disabled" &&
              "Signatures will not be added to your emails."}
            {local_mode === "auto" &&
              "Your default signature will be automatically added to new emails."}
            {local_mode === "manual" &&
              "You can manually insert a signature when composing emails."}
          </p>
        </div>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm flex items-center justify-between"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <span>{error}</span>
            <Button
              className="p-1"
              size="icon"
              variant="ghost"
              onClick={() => set_error(null)}
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Your Signatures ({is_loading ? "..." : signatures.length})
            </h4>
            <Button
              disabled={editor.is_open}
              size="sm"
              variant="primary"
              onClick={open_create_editor}
            >
              <PlusIcon className="w-4 h-4" />
              Add Signature
            </Button>
          </div>

          <AnimatePresence>
            {editor.is_open && (
              <motion.div
                animate={{ opacity: 1 }}
                className="p-4 rounded-lg space-y-4"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px solid var(--border-secondary)",
                }}
                transition={{ duration: 0.15 }}
              >
                <div>
                  <label
                    className="text-sm font-medium block mb-2"
                    htmlFor="signature-name"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Signature Name
                  </label>
                  <Input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="bg-[var(--input-bg)] border-[var(--border-secondary)] text-[var(--text-primary)]"
                    id="signature-name"
                    placeholder="e.g., Work, Personal, Formal"
                    type="text"
                    value={editor.name}
                    onChange={(e) =>
                      set_editor((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label
                    className="text-sm font-medium block mb-2"
                    htmlFor="signature-content"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Signature Content
                  </label>
                  <textarea
                    className="flex w-full rounded-md border border-[var(--border-secondary)] bg-[var(--input-bg)] px-3 py-2 text-sm resize-none font-mono text-[var(--text-primary)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-500 transition-colors"
                    id="signature-content"
                    placeholder="Best regards,&#10;Your Name&#10;your@email.com"
                    rows={6}
                    value={editor.content}
                    onChange={(e) =>
                      set_editor((prev) => ({
                        ...prev,
                        content: e.target.value,
                      }))
                    }
                  />
                  <p
                    className="text-xs mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Plain text only. Use line breaks for formatting.
                  </p>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <Button
                    disabled={editor.is_saving}
                    variant="ghost"
                    onClick={close_editor}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      !editor.name.trim() ||
                      !editor.content.trim() ||
                      editor.is_saving
                    }
                    variant="primary"
                    onClick={handle_save}
                  >
                    {editor.is_saving
                      ? "Saving..."
                      : editor.editing_id
                        ? "Update Signature"
                        : "Create Signature"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {signatures.length === 0 && !editor.is_open ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <PencilIcon
                  className="w-6 h-6"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                No signatures yet
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Create your first signature to personalize your emails.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {signatures.map((signature) => (
                  <motion.div
                    key={signature.id}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-lg"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      border: "1px solid var(--border-secondary)",
                    }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h5
                          className="text-sm font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {signature.name}
                        </h5>
                        {signature.is_default && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                            style={{
                              backgroundColor: "var(--accent-color)",
                              color: "white",
                            }}
                          >
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!signature.is_default && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handle_set_default(signature.id)}
                          >
                            Set as default
                          </Button>
                        )}
                        <Button
                          size="icon"
                          title="Edit"
                          variant="ghost"
                          onClick={() => open_edit_editor(signature)}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                          disabled={deleting_id === signature.id}
                          size="icon"
                          title="Delete"
                          variant="ghost"
                          onClick={() => handle_delete(signature.id)}
                        >
                          {deleting_id === signature.id ? (
                            <div
                              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                              style={{
                                borderColor: "currentColor",
                                borderTopColor: "transparent",
                              }}
                            />
                          ) : (
                            <TrashIcon className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div
                      className="p-3 rounded-md font-mono text-xs leading-relaxed whitespace-pre-wrap"
                      style={{
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-primary)",
                      }}
                    >
                      {signature.content}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="pt-2">
        <h4
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Signature Placement
        </h4>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Choose where your signature appears in replies
        </p>

        <div className="space-y-2">
          {[
            {
              value: "below",
              label: "Below quoted text",
              description: "Signature appears after the quoted message",
            },
            {
              value: "above",
              label: "Above quoted text",
              description: "Signature appears before the quoted message",
            },
          ].map((option) => {
            const is_selected = local_placement === option.value;

            return (
              <button
                key={option.value}
                className="w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left"
                style={{
                  backgroundColor: is_selected
                    ? "var(--bg-selected)"
                    : "var(--bg-tertiary)",
                  border: is_selected
                    ? "1px solid var(--accent-color)"
                    : "1px solid var(--border-secondary)",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handle_placement_change(option.value as "below" | "above");
                }}
              >
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {option.label}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {option.description}
                  </p>
                </div>
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 transition-colors"
                  style={{
                    borderColor: is_selected
                      ? "var(--accent-color)"
                      : "var(--border-secondary)",
                    backgroundColor: is_selected
                      ? "var(--accent-color)"
                      : "transparent",
                  }}
                >
                  {is_selected && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
