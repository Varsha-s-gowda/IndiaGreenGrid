import Badge from "../ui/Badge";

const VARIANTS = {
  ISSUED: "success",
  PREVIEW: "info",
  SUPERSEDED: "neutral",
  VOID: "danger",
};

export default function BillStatusBadge({ status, isCurrent = false }) {
  const normalized = String(status || "").toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={VARIANTS[normalized] || "neutral"} dot>
        {normalized === "PREVIEW" ? "PREVIEW" : normalized || "UNKNOWN"}
      </Badge>
      {normalized === "ISSUED" && !isCurrent && (
        <Badge variant="warning">not current</Badge>
      )}
    </span>
  );
}
