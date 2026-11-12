import { Download } from "lucide-react";
import Button from "../ui/Button";

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set())
  );
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") value = JSON.stringify(value);
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ].join("\n");
}

export default function ExportButton({
  rows = [],
  filename = "india-green-grid-export.csv",
  label = "Export CSV",
  disabled = false,
}) {
  function handleExport() {
    if (!rows.length) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || !rows.length}
    >
      <Download size={13} />
      {label}
    </Button>
  );
}
