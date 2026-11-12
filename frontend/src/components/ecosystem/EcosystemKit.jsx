import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Paperclip,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { StatusBadge, labelForToken } from "../platform/DataBadges";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Modal from "../platform/Modal";
import useApiData from "../../hooks/useApiData";
import { formatDateTime, formatNumber, formatRelativeTime } from "../../lib/formatters";
import {
  downloadDocument,
  getDocuments,
  reviewDocument,
  uploadDocument,
} from "../../services/ecosystemService";

const PROVENANCE_TONES = {
  PLATFORM_RECORDED: "success",
  SAMPLE: "info",
  ESTIMATED: "info",
  UNAVAILABLE: "danger",
};

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function ProvenanceNote({ block, className = "" }) {
  if (!block) return null;
  const provenance = block.provenance || {};
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PROVENANCE_TONES[provenance.classification] || "neutral"} dot>
          {labelForToken(provenance.classification || "PLATFORM_RECORDED")}
        </Badge>
        {block.label && (
          <span className="text-[11px] font-semibold text-slate-700">{block.label}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        {provenance.note ||
          "Figures are calculated from workflow records on this platform."}
      </p>
    </div>
  );
}

export function MetricGrid({ items = [] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
          {item.detail && (
            <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{item.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function Timeline({ events = [], emptyMessage = "No timeline entries yet." }) {
  if (!events.length) {
    return <p className="text-xs text-slate-500">{emptyMessage}</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {events.map((event, index) => (
        <li key={event.id ?? `${event.status}-${index}`} className="relative">
          <span
            className={`absolute -left-[1.65rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
              index === events.length - 1 ? "bg-forest-700" : "bg-slate-300"
            }`}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={event.status} />
            {event.actor_role && (
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
                {labelForToken(event.actor_role)}
              </span>
            )}
            <span className="text-[10px] text-slate-400">
              {formatRelativeTime(event.created_at || event.at)}
            </span>
          </div>
          {event.note && (
            <p className="mt-1 text-[11px] leading-5 text-slate-600">{event.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function DetailGrid({ rows = [], className = "" }) {
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      {rows
        .filter(([, value]) => value !== undefined)
        .map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
          >
            <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
              {label}
            </p>
            <p className="mt-0.5 break-words text-xs font-semibold text-slate-800">
              {value === null || value === "" ? "—" : value}
            </p>
          </div>
        ))}
    </div>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  async function run(key, task) {
    setBusy(key);
    setError("");
    try {
      return await task();
    } catch (actionError) {
      setError(
        actionError?.message || "The action could not be completed. Please try again."
      );
      throw actionError;
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, run, setError };
}

export function ActionModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  placeholder = "Add a note (optional)",
  requireNote = false,
  tone = "primary",
  busy = false,
  onConfirm,
}) {
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState("");

  function close() {
    setNote("");
    setValidation("");
    onClose?.();
  }

  async function confirm() {
    if (requireNote && !note.trim()) {
      setValidation("A note is required for this action.");
      return;
    }
    await onConfirm?.(note.trim());
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={confirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <label className="block text-xs font-semibold text-slate-700" htmlFor="action-note">
        Note
      </label>
      <textarea
        id="action-note"
        className="field mt-1 min-h-[110px] w-full text-xs"
        placeholder={placeholder}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setValidation("");
        }}
      />
      {validation && <p className="mt-1 text-[11px] text-rose-600">{validation}</p>}
    </Modal>
  );
}

export function DocumentPanel({
  entityType,
  entityId,
  canUpload = false,
  canReview = false,
  documentTypes = ["SUPPORTING"],
  title = "Supporting documents",
  description = "PDF, images or office files up to 10 MB.",
}) {
  const { data, loading, error, reload } = useApiData(
    () => getDocuments({ entityType, entityId }),
    [entityType, entityId],
    { enabled: Boolean(entityType && entityId) }
  );
  const fileRef = useRef(null);
  const [documentType, setDocumentType] = useState(documentTypes[0] || "SUPPORTING");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  const documents = data?.items || [];

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setMessage("");
    try {
      await uploadDocument({ entityType, entityId, documentType, file });
      setMessage(`${file.name} uploaded.`);
      reload();
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure?.message || "The file could not be uploaded."
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleReview(document, status) {
    setUploadError("");
    try {
      await reviewDocument(document.id, { status, note: "" });
      reload();
    } catch (reviewFailure) {
      setUploadError(reviewFailure?.message || "The document could not be reviewed.");
    }
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        icon={Paperclip}
        action={
          <Badge variant={documents.length ? "forest" : "neutral"}>
            {formatNumber(documents.length, 0)} files
          </Badge>
        }
      />
      <CardBody className="space-y-3">
        {canUpload && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3">
            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500"
                htmlFor="document-type"
              >
                Document type
              </label>
              <select
                id="document-type"
                className="field mt-1 h-9 text-xs"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
              >
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {labelForToken(type)}
                  </option>
                ))}
              </select>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xlsx"
              onChange={handleUpload}
              id="document-file"
            />
            <Button
              size="sm"
              variant="outline"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={13} />
              Upload file
            </Button>
            {message && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                <CheckCircle2 size={12} /> {message}
              </span>
            )}
          </div>
        )}
        {uploadError && (
          <p className="inline-flex items-center gap-1 text-[11px] text-rose-600">
            <AlertCircle size={12} /> {uploadError}
          </p>
        )}
        {error ? (
          <ErrorState compact title="Documents unavailable" message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Loading documents…
          </div>
        ) : documents.length ? (
          <ul className="divide-y divide-slate-100">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                    <FileText size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {document.file_name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {labelForToken(document.document_type)} ·{" "}
                      {formatNumber((document.size_bytes || 0) / 1024, 1)} KB ·{" "}
                      {formatRelativeTime(document.uploaded_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={document.status} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadDocument(document.id, document.file_name)}
                  >
                    <Download size={13} />
                    Download
                  </Button>
                  {canReview && ["UPLOADED", "PENDING"].includes(document.status) && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReview(document, "ACCEPTED")}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReview(document, "REJECTED")}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={Paperclip}
            title="No documents attached"
            description={
              canUpload
                ? "Upload bills, registrations or supporting evidence to speed up verification."
                : "The record owner has not attached any documents yet."
            }
          />
        )}
      </CardBody>
    </Card>
  );
}

export function StatusPill({ value, children }) {
  return <StatusBadge value={value}>{children}</StatusBadge>;
}

export function NoteBanner({ tone = "info", title, children }) {
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 ${styles}`}>
      <ShieldCheck size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-[11px] leading-5">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function AuditTime({ value }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <Clock size={11} />
      {value ? formatDateTime(value) : "—"}
    </span>
  );
}
