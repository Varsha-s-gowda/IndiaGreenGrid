"""Minimal, dependency-free PDF statements for BillFair.

The project intentionally has no PDF runtime dependency, so this module writes
a small standards-compliant PDF 1.4 document with the built-in Helvetica fonts.
It is deliberately limited to text, rules and filled rectangles: enough for a
professional, branded bill statement without shelling out to a browser.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89
MARGIN = 42.0
CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2)

FOREST = (0.12, 0.35, 0.24)
FOREST_LIGHT = (0.92, 0.96, 0.93)
SLATE = (0.20, 0.25, 0.32)
MUTED = (0.42, 0.48, 0.55)
LINE = (0.86, 0.89, 0.92)
WHITE = (1.0, 1.0, 1.0)
AMBER = (0.72, 0.45, 0.05)


def _clean(text: Any) -> str:
    value = "" if text is None else str(text)
    replacements = {
        "₹": "Rs. ",
        "–": "-",
        "—": "-",
        "·": "-",
        "≥": ">=",
        "≤": "<=",
        "→": "->",
        "\n": " ",
        "\r": " ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value.encode("latin-1", "replace").decode("latin-1")


def _escape(text: str) -> str:
    return _clean(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _format_inr(value: Any, *, sign: bool = True) -> str:
    try:
        numeric = float(value or 0)
    except (TypeError, ValueError):
        numeric = 0.0
    negative = numeric < 0
    numeric = abs(numeric)
    integer_text, decimal_text = f"{numeric:.2f}".split(".")
    if len(integer_text) > 3:
        head = integer_text[:-3]
        tail = integer_text[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        integer_text = ",".join(groups + [tail])
    prefix = "-" if negative and sign else ""
    return f"{prefix}Rs. {integer_text}.{decimal_text}"


def _format_date(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y")
    if isinstance(value, date):
        return value.strftime("%d %b %Y")
    text = str(value)
    try:
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%d %b %Y")
        return datetime.strptime(text[:10], "%Y-%m-%d").strftime("%d %b %Y")
    except ValueError:
        return text


def _text_width(text: str, size: float, bold: bool = False) -> float:
    return len(_clean(text)) * size * (0.56 if bold else 0.52)


def _wrap(text: str, size: float, max_width: float, bold: bool = False) -> list[str]:
    words = _clean(text).split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if _text_width(candidate, size, bold) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


class _PdfBuilder:
    def __init__(self) -> None:
        self.pages: list[list[str]] = [[]]
        self.y = PAGE_HEIGHT - MARGIN
        self._begin_page(first=True)

    @property
    def page(self) -> list[str]:
        return self.pages[-1]

    def _begin_page(self, *, first: bool = False) -> None:
        self.y = PAGE_HEIGHT - MARGIN
        if first:
            return
        self._header_band(small=True)
        self.y -= 18

    def new_page(self) -> None:
        self.pages.append([])
        self.y = PAGE_HEIGHT - MARGIN
        self._header_band(small=True)
        self.y -= 18

    def ensure(self, height: float) -> None:
        if self.y - height < 66:
            self.new_page()

    def text(
        self,
        x: float,
        y: float,
        value: Any,
        *,
        size: float = 9,
        bold: bool = False,
        color: tuple[float, float, float] = SLATE,
    ) -> None:
        font = "F2" if bold else "F1"
        r, g, b = color
        self.page.append(
            f"BT /{font} {size:.2f} Tf {r:.3f} {g:.3f} {b:.3f} rg "
            f"1 0 0 1 {x:.2f} {y:.2f} Tm ({_escape(str(value))}) Tj ET"
        )

    def text_right(
        self,
        x_right: float,
        y: float,
        value: Any,
        *,
        size: float = 9,
        bold: bool = False,
        color: tuple[float, float, float] = SLATE,
    ) -> None:
        text = _clean(str(value))
        self.text(
            x_right - _text_width(text, size, bold),
            y,
            text,
            size=size,
            bold=bold,
            color=color,
        )

    def rect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        fill: tuple[float, float, float] | None = None,
        stroke: tuple[float, float, float] | None = None,
        line_width: float = 0.6,
    ) -> None:
        ops = []
        if fill is not None:
            r, g, b = fill
            ops.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        if stroke is not None:
            r, g, b = stroke
            ops.append(f"{r:.3f} {g:.3f} {b:.3f} RG {line_width:.2f} w")
        ops.append(f"{x:.2f} {y:.2f} {width:.2f} {height:.2f} re")
        if fill is not None and stroke is not None:
            ops.append("B")
        elif fill is not None:
            ops.append("f")
        else:
            ops.append("S")
        self.page.append(" ".join(ops))

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        *,
        color: tuple[float, float, float] = LINE,
        width: float = 0.6,
    ) -> None:
        r, g, b = color
        self.page.append(
            f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w "
            f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S"
        )

    def _header_band(self, *, small: bool = False) -> None:
        height = 54 if small else 74
        top = PAGE_HEIGHT - MARGIN
        self.rect(0, top - height + 12, PAGE_WIDTH, height, fill=FOREST)
        if small:
            self.text(MARGIN, top - 12, "SolarEquity 360 - BillFair statement", size=10, bold=True, color=WHITE)
            self.text_right(PAGE_WIDTH - MARGIN, top - 12, "Continued", size=9, color=(0.82, 0.90, 0.84))
        else:
            self.text(MARGIN, top - 8, "SolarEquity 360", size=20, bold=True, color=WHITE)
            self.text(MARGIN, top - 30, "BillFair - society solar electricity statement", size=10, color=(0.82, 0.90, 0.84))
            self.text_right(PAGE_WIDTH - MARGIN, top - 10, "BILLFAIR", size=12, bold=True, color=(0.82, 0.90, 0.84))
            self.text_right(PAGE_WIDTH - MARGIN, top - 30, "Internal society statement", size=8, color=(0.82, 0.90, 0.84))

    def section_title(self, title: str) -> None:
        self.ensure(34)
        self.y -= 18
        self.text(MARGIN, self.y, title, size=10, bold=True, color=FOREST)
        self.line(MARGIN, self.y - 4, PAGE_WIDTH - MARGIN, self.y - 4, color=FOREST, width=0.8)
        self.y -= 14

    def key_values(self, rows: list[tuple[str, Any]], *, columns: int = 2) -> None:
        if not rows:
            return
        row_height = 15
        visible_rows = (len(rows) + columns - 1) // columns
        self.ensure(visible_rows * row_height + 8)
        gap = 18
        col_width = (CONTENT_WIDTH - gap * (columns - 1)) / columns
        for index, (label, value) in enumerate(rows):
            col = index % columns
            row = index // columns
            x = MARGIN + col * (col_width + gap)
            y = self.y - row * row_height
            self.text(x, y, f"{label}:", size=7.5, color=MUTED)
            self.text(x + 92, y, value, size=8, bold=True, color=SLATE)
        self.y -= visible_rows * row_height + 4

    def table_header(self, columns: list[tuple[str, float, str]]) -> None:
        self.ensure(28)
        self.rect(MARGIN, self.y - 18, CONTENT_WIDTH, 18, fill=FOREST_LIGHT)
        x = MARGIN
        for label, width, align in columns:
            if align == "right":
                self.text_right(x + width - 6, self.y - 13, label, size=7.5, bold=True, color=FOREST)
            else:
                self.text(x + 6, self.y - 13, label, size=7.5, bold=True, color=FOREST)
            x += width
        self.y -= 18

    def table_row(
        self,
        values: list[tuple[Any, str]],
        columns: list[tuple[str, float, str]],
        *,
        description_lines: list[str] | None = None,
        bold: bool = False,
        fill: tuple[float, float, float] | None = None,
    ) -> None:
        description = description_lines or _wrap(str(values[0][0]), 8, columns[0][1] - 12)
        row_height = max(16, 11 * len(description) + 6)
        self.ensure(row_height + 4)
        if fill is not None:
            self.rect(MARGIN, self.y - row_height, CONTENT_WIDTH, row_height, fill=fill)
        x = MARGIN
        y = self.y - 12
        for line_index, line in enumerate(description):
            self.text(x + 6, y - line_index * 10.5, line, size=8, bold=bold, color=SLATE)
        x += columns[0][1]
        for column_index, (value, align) in enumerate(values[1:], start=1):
            width = columns[column_index][1]
            if align == "right":
                self.text_right(x + width - 6, y, value, size=8, bold=bold, color=SLATE)
            else:
                self.text(x + 6, y, value, size=8, bold=bold, color=SLATE)
            x += width
        self.line(MARGIN, self.y - row_height, PAGE_WIDTH - MARGIN, self.y - row_height)
        self.y -= row_height

    def footer(self) -> None:
        page_number = len(self.pages)
        self.text(
            MARGIN,
            30,
            "SolarEquity 360 - BillFair. Internal society statement; not an official BESCOM bill.",
            size=7,
            color=MUTED,
        )
        self.text_right(PAGE_WIDTH - MARGIN, 30, f"Page {page_number}", size=7, color=MUTED)

    def to_bytes(self) -> bytes:
        objects: list[bytes] = []
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        objects.append(b"")  # pages object placeholder
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

        page_object_numbers: list[int] = []
        for page in self.pages:
            content = "\n".join(page).encode("latin-1", "replace")
            content_number = len(objects) + 2
            page_number = len(objects) + 1
            page_object_numbers.append(page_number)
            objects.append(
                (
                    f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH:.2f} {PAGE_HEIGHT:.2f}] "
                    f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                    f"/Contents {content_number} 0 R >>"
                ).encode("latin-1")
            )
            objects.append(
                b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream"
            )

        kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
        objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_numbers)} >>".encode("latin-1")

        buffer = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets: list[int] = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(buffer))
            buffer.extend(f"{index} 0 obj\n".encode("latin-1"))
            buffer.extend(obj)
            buffer.extend(b"\nendobj\n")
        xref_offset = len(buffer)
        buffer.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
        buffer.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            buffer.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
        buffer.extend(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF\n"
            ).encode("latin-1")
        )
        return bytes(buffer)


def build_bill_pdf(bill: dict[str, Any]) -> bytes:
    """Render a complete BillFair statement from the API payload."""

    builder = _PdfBuilder()
    apartment = bill.get("apartment") or {}
    resident = bill.get("resident") or {}

    builder._header_band()
    builder.y = PAGE_HEIGHT - MARGIN - 94

    builder.rect(MARGIN, builder.y - 44, CONTENT_WIDTH, 44, fill=(0.97, 0.98, 0.97), stroke=LINE)
    builder.text(MARGIN + 12, builder.y - 15, "Bill number", size=7.5, color=MUTED)
    builder.text(MARGIN + 12, builder.y - 30, bill.get("bill_number") or "PREVIEW", size=11, bold=True, color=FOREST)
    builder.text(MARGIN + 205, builder.y - 15, "Billing period", size=7.5, color=MUTED)
    builder.text(MARGIN + 205, builder.y - 30, bill.get("billing_period_label") or "-", size=10, bold=True)
    builder.text(MARGIN + 365, builder.y - 15, "Generated", size=7.5, color=MUTED)
    builder.text(MARGIN + 365, builder.y - 30, _format_date(bill.get("generated_at")), size=10, bold=True)
    builder.y -= 62

    builder.section_title("Apartment and resident")
    builder.key_values(
        [
            ("Flat", apartment.get("flat_number") or "-"),
            ("Category", apartment.get("apartment_category") or "-"),
            ("Floor", apartment.get("floor_number") or "-"),
            ("Residents", apartment.get("residents_count") or "-"),
            ("Resident", resident.get("name") or "Not linked"),
            ("Email", resident.get("email") or "-"),
            ("Bill status", bill.get("status") or "-"),
            ("Version", f"v{bill.get('version') or 0}"),
            ("Allocation run", f"#{bill.get('allocation_run_id')}" if bill.get("allocation_run_id") else "-"),
            ("Allocation method", (bill.get("allocation_method_label") or "-")),
        ]
    )

    builder.section_title("Energy summary")
    columns = [
        ("Measure", 300.0, "left"),
        ("Value", 125.0, "right"),
        ("Unit", 86.0, "right"),
    ]
    builder.table_header(columns)
    energy_rows = [
        ("Apartment consumption", bill.get("consumption_kwh"), "kWh"),
        ("Solar allocation", bill.get("solar_allocation_kwh"), "kWh"),
        ("Grid import (consumption - solar)", bill.get("grid_import_kwh"), "kWh"),
        ("Solar coverage", bill.get("solar_coverage_percentage"), "%"),
        ("Allocation hours", bill.get("hour_count"), "hours"),
    ]
    for label, value, unit in energy_rows:
        builder.ensure(18)
        builder.text(MARGIN + 6, builder.y - 12, label, size=8)
        display = f"{float(value or 0):,.3f}" if unit in ("kWh", "%") else f"{int(value or 0)}"
        builder.text_right(MARGIN + 300 + 119, builder.y - 12, display, size=8, bold=True)
        builder.text_right(PAGE_WIDTH - MARGIN - 6, builder.y - 12, unit, size=8, color=MUTED)
        builder.line(MARGIN, builder.y - 17, PAGE_WIDTH - MARGIN, builder.y - 17)
        builder.y -= 17

    builder.section_title("Charge breakdown")
    charge_columns = [
        ("Description", 315.0, "left"),
        ("Quantity", 80.0, "right"),
        ("Rate", 70.0, "right"),
        ("Amount", 88.0, "right"),
    ]
    builder.table_header(charge_columns)
    for item in bill.get("line_items") or []:
        description = str(item.get("description") or "")
        lines = _wrap(description, 8, charge_columns[0][1] - 12)
        row_height = max(17, 11 * len(lines) + 6)
        builder.ensure(row_height + 2)
        for line_index, line in enumerate(lines):
            builder.text(MARGIN + 6, builder.y - 12 - line_index * 10.5, line, size=8)
        x = MARGIN + charge_columns[0][1]
        quantity = item.get("quantity")
        quantity_text = f"{float(quantity or 0):,.3f} {item.get('unit') or ''}".strip()
        builder.text_right(x + charge_columns[1][1] - 6, builder.y - 12, quantity_text, size=8)
        builder.text_right(
            x + charge_columns[1][1] + charge_columns[2][1] - 6,
            builder.y - 12,
            _format_inr(item.get("rate")),
            size=8,
        )
        amount = float(item.get("amount") or 0)
        builder.text_right(
            PAGE_WIDTH - MARGIN - 6,
            builder.y - 12,
            _format_inr(amount),
            size=8,
            bold=item.get("charge_type") in ("MAINTENANCE", "OTHER_CHARGE"),
            color=AMBER if amount < 0 else SLATE,
        )
        builder.line(MARGIN, builder.y - row_height, PAGE_WIDTH - MARGIN, builder.y - row_height)
        builder.y -= row_height

    builder.ensure(54)
    builder.rect(MARGIN, builder.y - 42, CONTENT_WIDTH, 42, fill=FOREST)
    builder.text(MARGIN + 12, builder.y - 16, "Net payable (internal society statement)", size=9, color=WHITE)
    builder.text(MARGIN + 12, builder.y - 32, "Grid charge - solar credit + maintenance + other charges", size=7, color=(0.82, 0.90, 0.84))
    builder.text_right(PAGE_WIDTH - MARGIN - 12, builder.y - 27, _format_inr(bill.get("net_payable")), size=17, bold=True, color=WHITE)
    builder.y -= 58

    builder.section_title("Savings comparison")
    builder.key_values(
        [
            ("No-solar baseline", _format_inr(bill.get("no_solar_baseline_cost"))),
            ("Actual estimated cost", _format_inr(bill.get("actual_estimated_cost"))),
            ("Estimated savings", _format_inr(bill.get("estimated_savings"))),
            ("Internal solar credit", _format_inr(bill.get("solar_credit"))),
            ("Weighted grid tariff", f"{_format_inr(bill.get('tariff_price_per_kwh'))}/kWh"),
            ("Solar credit rate", f"{_format_inr(bill.get('solar_credit_rate_per_kwh'))}/kWh"),
        ]
    )
    builder.ensure(30)
    builder.text(
        MARGIN,
        builder.y,
        "Estimated savings measure avoided grid electricity at the applicable tariff. "
        "The internal solar credit is a separate society benefit applied to the payable amount.",
        size=7.2,
        color=MUTED,
    )
    builder.y -= 22

    if bill.get("tariff_snapshot"):
        builder.section_title("Applicable tariff and rule segments")
        builder.table_header(
            [
                ("Period", 150.0, "left"),
                ("Tariff/kWh", 90.0, "right"),
                ("Credit/kWh", 90.0, "right"),
                ("Grid kWh", 90.0, "right"),
                ("Grid charge", 91.0, "right"),
            ]
        )
        for segment in bill.get("tariff_snapshot") or []:
            builder.ensure(18)
            period_text = f"{_format_date(segment.get('start_date'))} - {_format_date(segment.get('end_date'))}"
            builder.text(MARGIN + 6, builder.y - 12, period_text, size=7.6)
            builder.text_right(MARGIN + 150 + 84, builder.y - 12, _format_inr(segment.get("tariff_price_per_kwh")), size=7.6)
            builder.text_right(MARGIN + 240 + 84, builder.y - 12, _format_inr(segment.get("solar_credit_rate_per_kwh")), size=7.6)
            builder.text_right(MARGIN + 330 + 84, builder.y - 12, f"{float(segment.get('grid_import_kwh') or 0):,.3f}", size=7.6)
            builder.text_right(PAGE_WIDTH - MARGIN - 6, builder.y - 12, _format_inr(segment.get("grid_charge")), size=7.6)
            builder.line(MARGIN, builder.y - 17, PAGE_WIDTH - MARGIN, builder.y - 17)
            builder.y -= 17

    builder.ensure(58)
    builder.rect(MARGIN, builder.y - 48, CONTENT_WIDTH, 48, fill=(1.0, 0.98, 0.92), stroke=(0.95, 0.85, 0.62))
    builder.text(MARGIN + 10, builder.y - 15, "Important distinction", size=8, bold=True, color=AMBER)
    disclaimer = bill.get("disclaimer") or (
        "This is an internal society statement. Grid charges are estimates from "
        "society tariff configuration, not an official BESCOM bill."
    )
    for index, line in enumerate(_wrap(disclaimer, 7.2, CONTENT_WIDTH - 20)[:3]):
        builder.text(MARGIN + 10, builder.y - 28 - index * 9, line, size=7.2, color=MUTED)
    builder.y -= 60

    for index, page in enumerate(builder.pages):
        page_number = index + 1
        page.append(
            f"BT /F1 7 Tf 0.420 0.480 0.550 rg 1 0 0 1 {MARGIN:.2f} 30.00 Tm "
            f"({_escape('SolarEquity 360 - BillFair. Internal society statement; not an official BESCOM bill.')}) Tj ET"
        )
        page.append(
            f"BT /F1 7 Tf 0.420 0.480 0.550 rg 1 0 0 1 "
            f"{PAGE_WIDTH - MARGIN - _text_width(f'Page {page_number}', 7):.2f} 30.00 Tm "
            f"({_escape(f'Page {page_number}')}) Tj ET"
        )
    return builder.to_bytes()
