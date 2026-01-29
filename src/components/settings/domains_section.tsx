import { useState, useEffect, useCallback } from "react";
import {
  PlusIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { ConfirmationModal } from "@/components/confirmation_modal";
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
            Add a custom domain to send and receive email using your own
            domain name. You will need to configure DNS records to verify
            ownership.
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
                You have reached the maximum of {max_domains} domains for
                your plan. Upgrade to add more.
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
              saving ||
              !domain_name ||
              !validate_domain_name(domain_name).valid
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

export function DomainsSection() {
  const [domains, set_domains] = useState<CustomDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [max_domains, set_max_domains] = useState(0);
  const [show_add_modal, set_show_add_modal] = useState(false);
  const [verifying_id, set_verifying_id] = useState<string | null>(null);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [delete_confirm, set_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const load_domains = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_domains();

      if (response.data) {
        set_domains(response.data.domains);
        set_max_domains(response.data.max_domains);
      }
    } catch {
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_domains();
  }, [load_domains]);

  const handle_verify = async (id: string) => {
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

  const handle_delete = (id: string) => {
    set_delete_confirm({ is_open: true, id });
  };

  const confirm_delete = async () => {
    const id = delete_confirm.id;

    if (!id) return;
    set_delete_confirm({ is_open: false, id: null });
    set_deleting_id(id);
    try {
      const response = await delete_domain(id);

      if (!response.error) {
        set_domains((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
    } finally {
      set_deleting_id(null);
    }
  };

  if (!loading && max_domains === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Custom Domains
          </h3>
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
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Upgrade your plan to add custom domains and send email from your
              own domain.
            </p>
            <Button variant="primary">
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Custom Domains
          </h3>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {domains.length} / {max_domains} used
          </span>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Add your own domain to send and receive email. You will need access to
          your domain&apos;s DNS settings to complete verification.
        </p>

        <Button
          className="w-full mb-3"
          size="lg"
          variant="primary"
          onClick={() => set_show_add_modal(true)}
        >
          <PlusIcon className="w-4 h-4" />
          Add Domain
        </Button>

        {loading ? (
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
                deleting={deleting_id === domain.id}
                domain={domain}
                on_delete={handle_delete}
                on_verify={handle_verify}
                verifying={verifying_id === domain.id}
              />
            ))}
          </div>
        )}
      </div>

      <AddDomainModal
        current_count={domains.length}
        is_open={show_add_modal}
        max_domains={max_domains}
        on_close={() => set_show_add_modal(false)}
        on_created={load_domains}
      />

      <ConfirmationModal
        confirm_text="Delete"
        is_open={delete_confirm.is_open}
        message="Are you sure you want to delete this domain? This action cannot be undone."
        on_cancel={() => set_delete_confirm({ is_open: false, id: null })}
        on_confirm={confirm_delete}
        title="Delete Domain"
        variant="danger"
      />
    </div>
  );
}
