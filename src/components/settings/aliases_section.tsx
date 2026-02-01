import { useState, useEffect, useCallback, useRef } from "react";
import {
  PlusIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  BoltIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

import { use_auth } from "@/contexts/auth_context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  list_aliases,
  create_alias,
  update_alias,
  delete_alias,
  check_alias_availability,
  decrypt_aliases,
  validate_local_part,
  get_alias_counts,
  generate_random_alias,
  type DecryptedEmailAlias,
  type AliasListResponse,
  type AliasCountsResponse,
} from "@/services/api/aliases";
import {
  list_domains,
  add_domain,
  delete_domain,
  trigger_verification,
  get_dns_records,
  validate_domain_name,
  get_status_color,
  get_status_label,
  type CustomDomain,
  type DnsRecord,
  type DnsRecordsResponse,
} from "@/services/api/domains";

const DEFAULT_DOMAINS = ["astermail.org", "aster.cx"];

interface CreateAliasModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: () => void;
  max_aliases: number;
  current_count: number;
  available_domains: string[];
}

function CreateAliasModal({
  is_open,
  on_close,
  on_created,
  max_aliases,
  current_count,
  available_domains,
}: CreateAliasModalProps) {
  const [local_part, set_local_part] = useState("");
  const [domain, set_domain] = useState(
    available_domains[0] || DEFAULT_DOMAINS[0],
  );
  const [display_name, set_display_name] = useState("");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [checking, set_checking] = useState(false);
  const [is_available, set_is_available] = useState<boolean | null>(null);
  const check_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (is_open) {
      set_local_part("");
      set_domain(available_domains[0] || DEFAULT_DOMAINS[0]);
      set_display_name("");
      set_error(null);
      set_is_available(null);
    }
  }, [is_open, available_domains]);

  const check_availability = useCallback(async (lp: string, d: string) => {
    if (!lp || lp.length < 3) {
      set_is_available(null);

      return;
    }

    const validation = validate_local_part(lp);

    if (!validation.valid) {
      set_is_available(null);

      return;
    }

    set_checking(true);
    try {
      const response = await check_alias_availability(lp, d);

      if (response.data) {
        set_is_available(response.data.available);
      }
    } catch {
      set_is_available(null);
    } finally {
      set_checking(false);
    }
  }, []);

  useEffect(() => {
    if (check_timeout_ref.current) {
      clearTimeout(check_timeout_ref.current);
    }

    if (local_part.length >= 3) {
      check_timeout_ref.current = setTimeout(() => {
        check_availability(local_part, domain);
      }, 500);
    } else {
      set_is_available(null);
    }

    return () => {
      if (check_timeout_ref.current) {
        clearTimeout(check_timeout_ref.current);
      }
    };
  }, [local_part, domain, check_availability]);

  const handle_create = async () => {
    const validation = validate_local_part(local_part);

    if (!validation.valid) {
      set_error(validation.error || "Invalid alias");

      return;
    }

    if (is_available === false) {
      set_error("This alias is already taken");

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      const response = await create_alias(
        local_part,
        domain,
        display_name || undefined,
      );

      if (response.error) {
        set_error(response.error);
      } else {
        on_created();
        on_close();
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to create alias");
    } finally {
      set_saving(false);
    }
  };

  const at_limit = current_count >= max_aliases;

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>Create Email Alias</ModalTitle>
        {!at_limit && (
          <ModalDescription>
            Create an alternate email address that forwards to your main inbox.
          </ModalDescription>
        )}
      </ModalHeader>

      <ModalBody>
        {at_limit ? (
          <div
            className="flex items-center gap-3 p-4 rounded-lg"
            style={{
              backgroundColor: "var(--bg-warning)",
              border: "1px solid var(--border-warning)",
            }}
          >
            <ExclamationTriangleIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-warning)" }}
            />
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-warning)" }}
              >
                Alias limit reached
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                You have reached the maximum of {max_aliases} aliases for your
                plan. Upgrade to create more.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                className="text-sm font-medium block mb-2"
                htmlFor="alias-address"
                style={{ color: "var(--text-primary)" }}
              >
                Alias Address
              </label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <Input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className={`pr-10 bg-[var(--input-bg)] text-[var(--text-primary)] ${
                      is_available === false
                        ? "border-red-500"
                        : is_available === true
                          ? "border-green-500"
                          : "border-[var(--border-secondary)]"
                    }`}
                    id="alias-address"
                    placeholder="newsletter"
                    size="lg"
                    value={local_part}
                    onChange={(e) =>
                      set_local_part(e.target.value.toLowerCase().trim())
                    }
                    onKeyDown={(e) => e.key === "Enter" && handle_create()}
                  />
                  {checking && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <ArrowPathIcon
                        className="w-4 h-4 animate-spin"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                  )}
                  {!checking && is_available === true && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                  {!checking && is_available === false && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <XMarkIcon className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                </div>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  @
                </span>
                <Select value={domain} onValueChange={set_domain}>
                  <SelectTrigger className="w-[160px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {available_domains.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {local_part && !validate_local_part(local_part).valid && (
                <p className="text-xs mt-1.5 text-red-500">
                  {validate_local_part(local_part).error}
                </p>
              )}
              {is_available === false && (
                <p className="text-xs mt-1.5 text-red-500">
                  This alias is already taken
                </p>
              )}
            </div>

            <div>
              <label
                className="text-sm font-medium block mb-2"
                htmlFor="alias-display-name"
                style={{ color: "var(--text-primary)" }}
              >
                Display Name{" "}
                <span style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <Input
                className="bg-[var(--input-bg)] border-[var(--border-secondary)] text-[var(--text-primary)]"
                id="alias-display-name"
                placeholder="Newsletter Alias"
                size="lg"
                value={display_name}
                onChange={(e) => set_display_name(e.target.value)}
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          Cancel
        </Button>
        {!at_limit && (
          <Button
            disabled={saving || !local_part || is_available === false}
            variant="primary"
            onClick={handle_create}
          >
            {saving ? "Creating..." : "Create Alias"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

interface PrimaryEmailItemProps {
  email: string;
  display_name?: string;
}

function PrimaryEmailItem({ email, display_name }: PrimaryEmailItemProps) {
  const [copied, set_copied] = useState(false);

  const copy_address = async () => {
    await navigator.clipboard.writeText(email);
    set_copied(true);
    setTimeout(() => set_copied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "var(--accent-primary-muted)" }}
      >
        <StarIcon
          className="w-5 h-5"
          style={{ color: "var(--accent-primary)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {email}
          </p>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "white",
            }}
          >
            Primary
          </span>
        </div>
        {display_name && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {display_name}
          </p>
        )}
      </div>
      <Button
        className="h-8 w-8 flex-shrink-0"
        size="icon"
        title={copied ? "Copied!" : "Copy address"}
        variant="ghost"
        onClick={copy_address}
      >
        {copied ? (
          <CheckIcon className="w-4 h-4 text-green-500" />
        ) : (
          <ClipboardDocumentIcon
            className="w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
        )}
      </Button>
    </div>
  );
}

interface AliasItemProps {
  alias: DecryptedEmailAlias;
  on_toggle: (id: string, enabled: boolean) => void;
  on_delete: (id: string) => void;
  toggling: boolean;
  deleting: boolean;
}

function AliasItem({
  alias,
  on_toggle,
  on_delete,
  toggling,
  deleting,
}: AliasItemProps) {
  const [copied, set_copied] = useState(false);

  const copy_address = async () => {
    await navigator.clipboard.writeText(alias.full_address);
    set_copied(true);
    setTimeout(() => set_copied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl transition-all"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-secondary)",
        opacity: alias.is_enabled ? 1 : 0.5,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: alias.is_random
            ? "var(--bg-tertiary)"
            : "var(--bg-tertiary)",
        }}
      >
        {alias.is_random ? (
          <BoltIcon
            className="w-5 h-5"
            style={{ color: "var(--text-muted)" }}
          />
        ) : (
          <AtSymbolIcon
            className="w-5 h-5"
            style={{ color: "var(--text-muted)" }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {alias.full_address}
          </p>
          {alias.is_random && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-muted)",
              }}
            >
              Random
            </span>
          )}
        </div>
        {alias.display_name && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {alias.display_name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          className="h-8 w-8"
          size="icon"
          title={copied ? "Copied!" : "Copy address"}
          variant="ghost"
          onClick={copy_address}
        >
          {copied ? (
            <CheckIcon className="w-4 h-4 text-green-500" />
          ) : (
            <ClipboardDocumentIcon
              className="w-4 h-4"
              style={{ color: "var(--text-muted)" }}
            />
          )}
        </Button>

        <Switch
          checked={alias.is_enabled}
          disabled={toggling}
          onCheckedChange={(checked) => on_toggle(alias.id, checked)}
        />

        <Button
          className="h-8 w-8 text-red-500 hover:text-red-500 hover:bg-red-500/10"
          disabled={deleting}
          size="icon"
          variant="ghost"
          onClick={() => on_delete(alias.id)}
        >
          {deleting ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <TrashIcon className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface AddDomainModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: () => void;
  max_domains: number;
  current_count: number;
}

function AddDomainModal({
  is_open,
  on_close,
  on_created,
  max_domains,
  current_count,
}: AddDomainModalProps) {
  const [domain_name, set_domain_name] = useState("");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (is_open) {
      set_domain_name("");
      set_error(null);
    }
  }, [is_open]);

  const handle_create = async () => {
    const validation = validate_domain_name(domain_name);

    if (!validation.valid) {
      set_error(validation.error || "Invalid domain");

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      const response = await add_domain(domain_name);

      if (response.error) {
        set_error(response.error);
      } else {
        on_created();
        on_close();
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      set_saving(false);
    }
  };

  const at_limit = current_count >= max_domains;

  return (
    <Modal is_open={is_open} on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle>Add Custom Domain</ModalTitle>
        {!at_limit && (
          <ModalDescription>
            Add a custom domain to send and receive email using your own domain
            name. You will need to configure DNS records to verify ownership.
          </ModalDescription>
        )}
      </ModalHeader>

      <ModalBody>
        {at_limit ? (
          <div
            className="flex items-center gap-3 p-4 rounded-lg"
            style={{
              backgroundColor: "var(--bg-warning)",
              border: "1px solid var(--border-warning)",
            }}
          >
            <ExclamationTriangleIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: "var(--text-warning)" }}
            />
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-warning)" }}
              >
                Domain limit reached
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                You have reached the maximum of {max_domains} domains for your
                plan. Upgrade to add more.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label
              className="text-sm font-medium block mb-2"
              htmlFor="domain-name"
              style={{ color: "var(--text-primary)" }}
            >
              Domain Name
            </label>
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="bg-[var(--input-bg)] border-[var(--border-secondary)] text-[var(--text-primary)]"
              id="domain-name"
              placeholder="example.com"
              size="lg"
              value={domain_name}
              onChange={(e) =>
                set_domain_name(e.target.value.toLowerCase().trim())
              }
              onKeyDown={(e) => e.key === "Enter" && handle_create()}
            />
            {domain_name && !validate_domain_name(domain_name).valid && (
              <p className="text-xs mt-1.5 text-red-500">
                {validate_domain_name(domain_name).error}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          Cancel
        </Button>
        {!at_limit && (
          <Button
            disabled={
              saving || !domain_name || !validate_domain_name(domain_name).valid
            }
            variant="primary"
            onClick={handle_create}
          >
            {saving ? "Adding..." : "Add Domain"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

interface DnsRecordItemProps {
  record: DnsRecord;
}

function DnsRecordItem({ record }: DnsRecordItemProps) {
  const [copied, set_copied] = useState(false);

  const copy_value = async () => {
    await navigator.clipboard.writeText(record.value);
    set_copied(true);
    setTimeout(() => set_copied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
            }}
          >
            {record.record_type}
          </span>
          {record.priority && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Priority: {record.priority}
            </span>
          )}
          <span
            className="text-xs capitalize"
            style={{ color: "var(--text-muted)" }}
          >
            ({record.purpose})
          </span>
        </div>
        {record.is_verified ? (
          <CheckCircleIcon className="w-4 h-4 text-green-500" />
        ) : (
          <XMarkIcon className="w-4 h-4 text-yellow-500" />
        )}
      </div>
      <div className="mb-1">
        <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
          Host
        </p>
        <p
          className="text-sm font-mono break-all"
          style={{ color: "var(--text-primary)" }}
        >
          {record.host}
        </p>
      </div>
      <div>
        <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
          Value
        </p>
        <div className="flex items-start gap-2">
          <p
            className="text-sm font-mono break-all flex-1"
            style={{ color: "var(--text-primary)" }}
          >
            {record.value}
          </p>
          <Button
            className="h-6 w-6 flex-shrink-0"
            size="icon"
            title={copied ? "Copied!" : "Copy value"}
            variant="ghost"
            onClick={copy_value}
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <ClipboardDocumentIcon
                className="w-3.5 h-3.5"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DomainItemProps {
  domain: CustomDomain;
  on_verify: (id: string) => void;
  on_delete: (id: string) => void;
  verifying: boolean;
  deleting: boolean;
}

function DomainItem({
  domain,
  on_verify,
  on_delete,
  verifying,
  deleting,
}: DomainItemProps) {
  const [expanded, set_expanded] = useState(false);
  const [dns_records, set_dns_records] = useState<DnsRecord[]>([]);
  const [loading_records, set_loading_records] = useState(false);

  const load_dns_records = async () => {
    if (dns_records.length > 0) return;

    set_loading_records(true);
    try {
      const response = await get_dns_records(domain.id);

      if (response.data) {
        set_dns_records((response.data as DnsRecordsResponse).records);
      }
    } catch {
    } finally {
      set_loading_records(false);
    }
  };

  const handle_expand = () => {
    const new_expanded = !expanded;

    set_expanded(new_expanded);
    if (new_expanded) {
      load_dns_records();
    }
  };

  const verification_count = [
    domain.txt_verified,
    domain.mx_verified,
    domain.spf_verified,
    domain.dkim_verified,
  ].filter(Boolean).length;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            className="h-6 w-6 flex-shrink-0"
            size="icon"
            variant="ghost"
            onClick={handle_expand}
          >
            {expanded ? (
              <ChevronDownIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            ) : (
              <ChevronRightIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </Button>

          <GlobeAltIcon
            className="w-5 h-5 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />

          <div className="min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {domain.domain_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${get_status_color(domain.status)}`}
              >
                {get_status_label(domain.status)}
              </span>
              {domain.status !== "active" && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {verification_count}/4 verified
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {domain.status !== "active" && (
            <Button
              disabled={verifying}
              size="sm"
              variant="primary"
              onClick={() => on_verify(domain.id)}
            >
              {verifying ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheckIcon className="w-3.5 h-3.5" />
              )}
              Verify
            </Button>
          )}

          <Button
            className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
            disabled={deleting}
            size="icon"
            variant="ghost"
            onClick={() => on_delete(domain.id)}
          >
            {deleting ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          className="px-4 pb-4 pt-2"
          style={{ borderTop: "1px solid var(--border-secondary)" }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              {domain.txt_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                TXT
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.mx_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                MX
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.spf_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                SPF
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.dkim_verified ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-yellow-500" />
              )}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                DKIM
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {domain.dmarc_configured ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : (
                <XMarkIcon className="w-4 h-4 text-gray-400" />
              )}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                DMARC
              </span>
            </div>
          </div>

          <p className="text-sm mb-3" style={{ color: "var(--text-tertiary)" }}>
            Add these DNS records to your domain registrar to verify ownership
            and enable email:
          </p>

          {loading_records ? (
            <div />
          ) : (
            <div className="space-y-2">
              {dns_records.map((record, index) => (
                <DnsRecordItem key={index} record={record} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AliasesSection() {
  const { user } = use_auth();
  const [aliases, set_aliases] = useState<DecryptedEmailAlias[]>([]);
  const [aliases_loading, set_aliases_loading] = useState(true);
  const [max_aliases, set_max_aliases] = useState(3);
  const [show_create_alias_modal, set_show_create_alias_modal] =
    useState(false);
  const [toggling_id, set_toggling_id] = useState<string | null>(null);
  const [alias_deleting_id, set_alias_deleting_id] = useState<string | null>(
    null,
  );
  const [alias_delete_confirm, set_alias_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const [alias_counts, set_alias_counts] = useState<AliasCountsResponse | null>(
    null,
  );
  const [generating_random, set_generating_random] = useState(false);
  const [random_domain, set_random_domain] = useState(DEFAULT_DOMAINS[0]);

  const [domains, set_domains] = useState<CustomDomain[]>([]);
  const [domains_loading, set_domains_loading] = useState(true);
  const [max_domains, set_max_domains] = useState(0);
  const [show_add_domain_modal, set_show_add_domain_modal] = useState(false);
  const [verifying_id, set_verifying_id] = useState<string | null>(null);
  const [domain_deleting_id, set_domain_deleting_id] = useState<string | null>(
    null,
  );
  const [domain_delete_confirm, set_domain_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const available_domains_for_aliases = [
    ...DEFAULT_DOMAINS,
    ...domains.filter((d) => d.status === "active").map((d) => d.domain_name),
  ];

  const load_aliases = useCallback(async () => {
    set_aliases_loading(true);
    try {
      const response = await list_aliases();

      if (response.data) {
        const data = response.data as AliasListResponse;

        set_max_aliases(data.max_aliases);
        const decrypted = await decrypt_aliases(data.aliases);

        set_aliases(decrypted);
      }
    } catch {
    } finally {
      set_aliases_loading(false);
    }
  }, []);

  const load_alias_counts = useCallback(async () => {
    try {
      const response = await get_alias_counts();

      if (response.data) {
        set_alias_counts(response.data);
      }
    } catch {}
  }, []);

  const handle_generate_random = async () => {
    set_generating_random(true);
    try {
      const response = await generate_random_alias(random_domain);

      if (!response.error && response.data) {
        const new_alias: DecryptedEmailAlias = {
          id: response.data.id,
          local_part: response.data.local_part,
          domain: response.data.domain,
          full_address: response.data.full_address,
          is_enabled: true,
          is_random: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set_aliases((prev) => [new_alias, ...prev]);
        load_alias_counts();
      }
    } catch {
    } finally {
      set_generating_random(false);
    }
  };

  const load_domains = useCallback(async () => {
    set_domains_loading(true);
    try {
      const response = await list_domains();

      if (response.data) {
        set_domains(response.data.domains);
        set_max_domains(response.data.max_domains);
      }
    } catch {
    } finally {
      set_domains_loading(false);
    }
  }, []);

  useEffect(() => {
    load_aliases();
    load_domains();
    load_alias_counts();
  }, [load_aliases, load_domains, load_alias_counts]);

  const handle_alias_toggle = async (id: string, enabled: boolean) => {
    set_toggling_id(id);
    try {
      const response = await update_alias(id, { is_enabled: enabled });

      if (!response.error) {
        set_aliases((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_enabled: enabled } : a)),
        );
      }
    } catch {
    } finally {
      set_toggling_id(null);
    }
  };

  const handle_alias_delete = (id: string) => {
    set_alias_delete_confirm({ is_open: true, id });
  };

  const confirm_alias_delete = async () => {
    const id = alias_delete_confirm.id;

    if (!id) return;
    set_alias_delete_confirm({ is_open: false, id: null });
    set_alias_deleting_id(id);
    try {
      const response = await delete_alias(id);

      if (!response.error) {
        set_aliases((prev) => prev.filter((a) => a.id !== id));
        load_alias_counts();
      }
    } catch {
    } finally {
      set_alias_deleting_id(null);
    }
  };

  const handle_domain_verify = async (id: string) => {
    set_verifying_id(id);
    try {
      const response = await trigger_verification(id);

      if (!response.error && response.data) {
        set_domains((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: response.data!.status,
                  txt_verified: response.data!.txt_verified,
                  mx_verified: response.data!.mx_verified,
                  spf_verified: response.data!.spf_verified,
                  dkim_verified: response.data!.dkim_verified,
                  dmarc_configured: response.data!.dmarc_configured,
                }
              : d,
          ),
        );
      }
    } catch {
    } finally {
      set_verifying_id(null);
    }
  };

  const handle_domain_delete = (id: string) => {
    set_domain_delete_confirm({ is_open: true, id });
  };

  const confirm_domain_delete = async () => {
    const id = domain_delete_confirm.id;

    if (!id) return;
    set_domain_delete_confirm({ is_open: false, id: null });
    set_domain_deleting_id(id);
    try {
      const response = await delete_domain(id);

      if (!response.error) {
        set_domains((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
    } finally {
      set_domain_deleting_id(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AtSymbolIcon
              className="w-5 h-5"
              style={{ color: "var(--text-muted)" }}
            />
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Email Aliases
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {alias_counts && (
              <>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Custom: {alias_counts.custom_count + 1}/
                  {alias_counts.max_custom}
                </span>
                {alias_counts.can_create_random && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    Random: {alias_counts.random_count}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Create alternate email addresses that forward to your main inbox. Use
          them to protect your privacy or organize incoming mail.
          {domains.filter((d) => d.status === "active").length > 0 && (
            <span
              className="block mt-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              You can also create aliases on your verified custom domains.
            </span>
          )}
        </p>

        <div className="flex gap-2 mb-3">
          <Button
            className="flex-1"
            size="lg"
            variant="secondary"
            onClick={() => set_show_create_alias_modal(true)}
          >
            <PlusIcon className="w-4 h-4" />
            Custom Alias
          </Button>

          {alias_counts?.can_create_random ? (
            <div className="flex-1 flex gap-1">
              <Select value={random_domain} onValueChange={set_random_domain}>
                <SelectTrigger className="w-[130px] h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available_domains_for_aliases.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="flex-1"
                disabled={generating_random}
                size="lg"
                variant="primary"
                onClick={handle_generate_random}
              >
                {generating_random ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <SparklesIcon className="w-4 h-4" />
                )}
                Generate Random
              </Button>
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-muted)",
              }}
            >
              <SparklesIcon className="w-4 h-4" />
              <span>Upgrade for random aliases</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {user?.email && (
            <PrimaryEmailItem
              display_name={user.display_name}
              email={user.email}
            />
          )}

          {aliases_loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-secondary)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  />
                  <div className="flex-1 space-y-2">
                    <div
                      className="h-4 w-48 rounded"
                      style={{ backgroundColor: "var(--bg-tertiary)" }}
                    />
                    <div
                      className="h-3 w-24 rounded"
                      style={{ backgroundColor: "var(--bg-tertiary)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : aliases.length === 0 ? (
            <div
              className="text-center py-8 rounded-xl"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px dashed var(--border-secondary)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No additional aliases yet. Create one to protect your privacy.
              </p>
            </div>
          ) : (
            aliases.map((alias) => (
              <AliasItem
                key={alias.id}
                alias={alias}
                deleting={alias_deleting_id === alias.id}
                on_delete={handle_alias_delete}
                on_toggle={handle_alias_toggle}
                toggling={toggling_id === alias.id}
              />
            ))
          )}
        </div>
      </div>

      <div
        className="border-t pt-8"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        {!domains_loading && max_domains === 0 ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <GlobeAltIcon
                className="w-5 h-5"
                style={{ color: "var(--text-muted)" }}
              />
              <h3
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Custom Domains
              </h3>
            </div>
            <div
              className="p-6 rounded-lg text-center"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Custom domains not available
              </p>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Upgrade your plan to add custom domains and create aliases on
                your own domain.
              </p>
              <Button variant="primary">Upgrade Plan</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <GlobeAltIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-muted)" }}
                />
                <h3
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Custom Domains
                </h3>
              </div>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {domains.length} / {max_domains} used
              </span>
            </div>
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              Add your own domain to create aliases and send email from your
              domain. Verified domains will appear in the alias domain selector.
            </p>

            <Button
              className="w-full mb-3"
              size="lg"
              variant="primary"
              onClick={() => set_show_add_domain_modal(true)}
            >
              <PlusIcon className="w-4 h-4" />
              Add Domain
            </Button>

            {domains_loading ? (
              <div />
            ) : domains.length === 0 ? (
              <div
                className="text-center py-12 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px solid var(--border-secondary)",
                }}
              >
                <GlobeAltIcon
                  className="w-12 h-12 mx-auto mb-3"
                  style={{ color: "var(--text-muted)" }}
                />
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  No custom domains yet
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Add your first custom domain to get started
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {domains.map((domain) => (
                  <DomainItem
                    key={domain.id}
                    deleting={domain_deleting_id === domain.id}
                    domain={domain}
                    on_delete={handle_domain_delete}
                    on_verify={handle_domain_verify}
                    verifying={verifying_id === domain.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CreateAliasModal
        available_domains={available_domains_for_aliases}
        current_count={
          alias_counts?.custom_count ??
          aliases.filter((a) => !a.is_random).length
        }
        is_open={show_create_alias_modal}
        max_aliases={alias_counts?.max_custom ?? max_aliases}
        on_close={() => set_show_create_alias_modal(false)}
        on_created={() => {
          load_aliases();
          load_alias_counts();
        }}
      />

      <AddDomainModal
        current_count={domains.length}
        is_open={show_add_domain_modal}
        max_domains={max_domains}
        on_close={() => set_show_add_domain_modal(false)}
        on_created={load_domains}
      />

      <ConfirmationModal
        confirm_text="Delete"
        is_open={alias_delete_confirm.is_open}
        message="Are you sure you want to delete this alias? This action cannot be undone."
        on_cancel={() => set_alias_delete_confirm({ is_open: false, id: null })}
        on_confirm={confirm_alias_delete}
        title="Delete Alias"
        variant="danger"
      />

      <ConfirmationModal
        confirm_text="Delete"
        is_open={domain_delete_confirm.is_open}
        message="Are you sure you want to delete this domain? This action cannot be undone."
        on_cancel={() =>
          set_domain_delete_confirm({ is_open: false, id: null })
        }
        on_confirm={confirm_domain_delete}
        title="Delete Domain"
        variant="danger"
      />
    </div>
  );
}
