#!/usr/bin/env python3
"""Generate Retreaver Revenue Report PDF — Week 1 (Feb 17–21, 2026)"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, Color
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ── Colors ──
BG_DEEP = HexColor("#050a12")
BG_CARD = HexColor("#0c1018")
BG_ROW_ALT = HexColor("#0a0f1a")
BORDER = HexColor("#1a2332")
EMERALD = HexColor("#10b981")
EMERALD_DIM = HexColor("#10b98180")
AMBER = HexColor("#f59e0b")
RED = HexColor("#ef4444")
WHITE = HexColor("#ffffff")
WHITE_90 = HexColor("#e6e6e6")
WHITE_70 = HexColor("#b3b3b3")
WHITE_50 = HexColor("#808080")
WHITE_30 = HexColor("#4d4d4d")
WHITE_20 = HexColor("#333333")
WHITE_10 = HexColor("#1a1a1a")

# ── Font Setup ──
# Try to register a monospace font; fall back to Courier
MONO = "Courier"
MONO_BOLD = "Courier-Bold"
SANS = "Helvetica"
SANS_BOLD = "Helvetica-Bold"

# Check for custom fonts
font_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "fonts")
if os.path.exists(os.path.join(font_dir, "JetBrainsMono-Regular.ttf")):
    pdfmetrics.registerFont(TTFont("JetBrains", os.path.join(font_dir, "JetBrainsMono-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("JetBrains-Bold", os.path.join(font_dir, "JetBrainsMono-Bold.ttf")))
    MONO = "JetBrains"
    MONO_BOLD = "JetBrains-Bold"

W, H = letter  # 612 x 792
MARGIN = 40
CONTENT_W = W - 2 * MARGIN

OUTPUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "retreaver-revenue-report-week1.pdf")


def draw_bg(c):
    """Fill entire page with deep background."""
    c.setFillColor(BG_DEEP)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def draw_card(c, x, y, w, h, fill=BG_CARD):
    """Draw a rounded card background."""
    c.setFillColor(fill)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)


def draw_header_bar(c, y):
    """Draw the top header with logo area and title."""
    # Header background
    c.setFillColor(HexColor("#080d16"))
    c.rect(0, y, W, 70, fill=1, stroke=0)
    # Emerald accent line
    c.setStrokeColor(EMERALD)
    c.setLineWidth(2)
    c.line(0, y, W, y)

    # Title
    c.setFillColor(WHITE)
    c.setFont(SANS_BOLD, 16)
    c.drawString(MARGIN, y + 42, "RETREAVER REVENUE REPORT")
    c.setFont(SANS, 9)
    c.setFillColor(AMBER)
    c.drawString(MARGIN, y + 26, "WEEK 1  |  FEBRUARY 17 \u2013 21, 2026")
    c.setFillColor(WHITE_50)
    c.setFont(MONO, 7)
    c.drawString(MARGIN, y + 12, "PITCH VISION  \u2022  EXECUTIVE INTELLIGENCE")

    # Right side: branding
    c.setFillColor(EMERALD)
    c.setFont(SANS_BOLD, 11)
    c.drawRightString(W - MARGIN, y + 42, "pitchvision.io")
    c.setFillColor(WHITE_30)
    c.setFont(MONO, 7)
    c.drawRightString(W - MARGIN, y + 26, "CONFIDENTIAL")
    c.drawRightString(W - MARGIN, y + 12, "Generated Feb 21, 2026")


def draw_kpi_card(c, x, y, w, h, label, value, color=EMERALD, sub=None):
    """Draw a single KPI metric card."""
    draw_card(c, x, y, w, h)
    c.setFont(MONO, 6.5)
    c.setFillColor(WHITE_50)
    c.drawString(x + 8, y + h - 14, label.upper())
    c.setFont(MONO_BOLD, 16)
    c.setFillColor(color)
    c.drawString(x + 8, y + h - 34, value)
    if sub:
        c.setFont(MONO, 7)
        c.setFillColor(WHITE_30)
        c.drawString(x + 8, y + 6, sub)


def draw_executive_summary(c, y):
    """Draw the KPI cards row."""
    card_w = (CONTENT_W - 18) / 4  # 4 cards, 6px gap each
    gap = 6
    top = y

    draw_kpi_card(c, MARGIN, top, card_w, 52,
                  "Total Revenue", "$328,584", EMERALD, "5 days  \u2022  43,095 calls")
    draw_kpi_card(c, MARGIN + card_w + gap, top, card_w, 52,
                  "Converted", "38,381 (89%)", EMERALD, "Avg $8.56/conv")
    draw_kpi_card(c, MARGIN + 2 * (card_w + gap), top, card_w, 52,
                  "Payout", "$100,885", AMBER, "Net: $227,700")
    draw_kpi_card(c, MARGIN + 3 * (card_w + gap), top, card_w, 52,
                  "Diluted Avg", "$7.62/call", WHITE_70, "Incl. unconverted")

    return top - 8


def draw_section_header(c, y, text, accent_color=EMERALD):
    """Draw a section title with accent."""
    c.setStrokeColor(accent_color)
    c.setLineWidth(1.5)
    c.line(MARGIN, y, MARGIN + 3, y)
    c.setFont(MONO, 8)
    c.setFillColor(accent_color)
    c.drawString(MARGIN + 8, y - 4, text.upper())
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.3)
    c.line(MARGIN + 8 + c.stringWidth(text.upper(), MONO, 8) + 6, y - 1, W - MARGIN, y - 1)
    return y - 16


def draw_table(c, y, headers, rows, col_widths, col_aligns, totals_row=None, highlight_col=None, note=None):
    """Draw a Bloomberg-style data table."""
    row_h = 15
    header_h = 14
    x_start = MARGIN

    # Table background
    total_h = header_h + row_h * len(rows) + (row_h if totals_row else 0) + 4
    draw_card(c, MARGIN - 2, y - total_h + 2, CONTENT_W + 4, total_h)

    # Header row
    c.setFont(MONO, 6.5)
    c.setFillColor(WHITE_30)
    x = x_start
    for i, h in enumerate(headers):
        if col_aligns[i] == "R":
            c.drawRightString(x + col_widths[i] - 4, y - 10, h.upper())
        else:
            c.drawString(x + 4, y - 10, h.upper())
        x += col_widths[i]

    # Header separator
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN, y - header_h, W - MARGIN, y - header_h)

    # Data rows
    cy = y - header_h
    for ri, row in enumerate(rows):
        # Alternating row background
        if ri % 2 == 1:
            c.setFillColor(BG_ROW_ALT)
            c.rect(MARGIN, cy - row_h + 2, CONTENT_W, row_h, fill=1, stroke=0)

        c.setFont(MONO, 7.5)
        x = x_start
        for ci, cell in enumerate(row):
            if ci == highlight_col:
                c.setFillColor(EMERALD)
            elif str(cell).startswith("$") and ci > 0:
                c.setFillColor(EMERALD)
            elif str(cell).endswith("%"):
                val = cell.replace("%", "").replace("*", "").strip()
                try:
                    pct = float(val)
                    c.setFillColor(EMERALD if pct >= 70 else AMBER if pct >= 50 else RED)
                except ValueError:
                    c.setFillColor(WHITE_70)
            elif cell == "\u2014":
                c.setFillColor(WHITE_20)
            else:
                c.setFillColor(WHITE_90 if ci == 0 else WHITE_70)

            if col_aligns[ci] == "R":
                c.drawRightString(x + col_widths[ci] - 4, cy - 10, str(cell))
            else:
                c.drawString(x + 4, cy - 10, str(cell))
            x += col_widths[ci]
        cy -= row_h

    # Totals row
    if totals_row:
        c.setStrokeColor(EMERALD)
        c.setLineWidth(0.8)
        c.line(MARGIN + 2, cy + 1, W - MARGIN - 2, cy + 1)
        c.setFont(MONO_BOLD, 7.5)
        x = x_start
        for ci, cell in enumerate(totals_row):
            if str(cell).startswith("$"):
                c.setFillColor(EMERALD)
            else:
                c.setFillColor(WHITE)
            if col_aligns[ci] == "R":
                c.drawRightString(x + col_widths[ci] - 4, cy - 10, str(cell))
            else:
                c.drawString(x + 4, cy - 10, str(cell))
            x += col_widths[ci]
        cy -= row_h

    # Note
    if note:
        c.setFont(MONO, 6)
        c.setFillColor(WHITE_30)
        c.drawString(MARGIN + 4, cy - 6, note)
        cy -= 12

    return cy - 4


def draw_product_summary(c, y):
    """Draw revenue by product type as horizontal bars."""
    y = draw_section_header(c, y, "Revenue by Product Type")

    products = [
        ("Medicare", 153000, 7, "$7.00\u2013$11.93/call", EMERALD),
        ("Unknown", 115000, 0, "35% \u2014 pending attribution", WHITE_50),
        ("ACA", 57000, 3, "$10.50\u2013$11.50/call", HexColor("#3b82f6")),
        ("WhatIF", 12600, 1, "$7.00/call", AMBER),
        ("Other", 173, 0, "Hospital Indemnity, ACA FLOW", WHITE_30),
    ]

    max_rev = 153000
    bar_start = MARGIN + 80
    bar_max_w = CONTENT_W - 200

    for name, rev, camps, desc, color in products:
        draw_card(c, MARGIN, y - 20, CONTENT_W, 22)
        # Label
        c.setFont(MONO, 7.5)
        c.setFillColor(WHITE_90)
        c.drawString(MARGIN + 6, y - 14, name)
        # Bar
        bar_w = max(2, (rev / max_rev) * bar_max_w)
        c.setFillColor(color)
        c.rect(bar_start, y - 16, bar_w, 10, fill=1, stroke=0)
        # Value
        c.setFont(MONO_BOLD, 7.5)
        c.setFillColor(color)
        c.drawString(bar_start + bar_w + 6, y - 14, f"${rev:,.0f}")
        # Description
        c.setFont(MONO, 6)
        c.setFillColor(WHITE_30)
        c.drawRightString(W - MARGIN - 6, y - 14, desc)

        y -= 24

    return y - 4


def draw_key_metrics(c, y):
    """Draw key metrics box."""
    y = draw_section_header(c, y, "Key Metrics", AMBER)
    box_h = 52
    draw_card(c, MARGIN, y - box_h, CONTENT_W, box_h)

    metrics = [
        ("Revenue Tiers", "$0 (unconverted)  \u2022  $7 (Medicare)  \u2022  $10.50\u2013$11.50 (ACA)"),
        ("Peak Day", "Feb 18 \u2014 $137,411 (includes CSV backfill)"),
        ("Avg Daily Revenue", "$65,717  \u2022  Calls/Min (today): 2.3"),
        ("Unique Agents", "391 identified across CSV data"),
    ]

    cy = y - 12
    for label, value in metrics:
        c.setFont(MONO, 6.5)
        c.setFillColor(AMBER)
        c.drawString(MARGIN + 8, cy, label + ":")
        c.setFillColor(WHITE_70)
        c.drawString(MARGIN + 120, cy, value)
        cy -= 11

    return y - box_h - 8


def draw_notes(c, y):
    """Draw data quality notes section."""
    y = draw_section_header(c, y, "Notes & Data Quality", WHITE_50)

    notes = [
        "Data collection began Feb 17, 2026",
        "Sources: Real-time API pings (phone + revenue only) and manual CSV uploads (full detail)",
        '"Unknown" campaign bucket ($115K, 35%) = pings without campaign_name \u2014 pending enrichment from Retreaver',
        "Feb 21 data is partial (day still in progress at time of report generation)",
        "391 unique agents identified across CSV data",
        "Payout data only available from CSV sources ($100,885 YTD)",
    ]

    for note in notes:
        c.setFont(MONO, 6.5)
        c.setFillColor(WHITE_30)
        c.drawString(MARGIN + 4, y, "\u2022  " + note)
        y -= 11

    return y - 4


def draw_footer(c):
    """Draw page footer."""
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.3)
    c.line(MARGIN, 28, W - MARGIN, 28)
    c.setFont(MONO, 6)
    c.setFillColor(WHITE_20)
    c.drawString(MARGIN, 18, "Generated by Pitch Vision \u2022 pitchvision.io \u2022 Confidential")
    c.drawRightString(W - MARGIN, 18, "Retreaver Revenue Report \u2014 Week 1")


def build_pdf():
    c = canvas.Canvas(OUTPUT, pagesize=letter)
    c.setTitle("Retreaver Revenue Report \u2014 Week 1 (Feb 17\u201321, 2026)")
    c.setAuthor("Pitch Vision")
    c.setSubject("Revenue Analytics")

    # ═══════════════════════════════════════════
    # PAGE 1
    # ═══════════════════════════════════════════
    draw_bg(c)
    draw_header_bar(c, H - 70)
    y = H - 86

    # Executive Summary KPIs
    y = draw_executive_summary(c, y)

    # Daily Breakdown
    y = draw_section_header(c, y, "Daily Breakdown")

    daily_headers = ["Date", "Revenue", "Calls", "Converted", "Conv%", "Avg/Call"]
    daily_widths = [90, 100, 70, 80, 60, CONTENT_W - 400]
    daily_aligns = ["L", "R", "R", "R", "R", "R"]
    daily_rows = [
        ["2026-02-17", "$76,219.50", "9,572", "\u2014", "\u2014", "$7.96"],
        ["2026-02-18", "$137,410.50", "15,051", "\u2014", "\u2014", "$9.13"],
        ["2026-02-19", "$29,255.50", "4,186", "\u2014", "\u2014", "$6.99"],
        ["2026-02-20", "$75,303.50", "11,175", "\u2014", "\u2014", "$6.74"],
        ["2026-02-21", "$10,395.00", "3,111", "1,485", "48%*", "$3.34"],
    ]
    daily_totals = ["TOTAL", "$328,584.00", "43,095", "38,381", "89%", "$7.62"]

    y = draw_table(c, y, daily_headers, daily_rows, daily_widths, daily_aligns,
                   totals_row=daily_totals, highlight_col=1,
                   note="* Feb 21 still in progress at time of report")

    # Campaign Breakdown
    y = draw_section_header(c, y, "Campaign Breakdown")

    camp_headers = ["Campaign", "Revenue", "Calls", "Conv", "Avg/Call"]
    camp_widths = [180, 100, 60, 60, CONTENT_W - 400]
    camp_aligns = ["L", "R", "R", "R", "R"]
    camp_rows = [
        ["Unknown", "$114,954", "18,472", "13,758", "$6.22"],
        ["Medicare - Pitch Marketing", "$38,549", "5,507", "5,507", "$7.00"],
        ["MEDICARE ARAGON", "$29,204", "4,172", "4,172", "$7.00"],
        ["ACA - Warm Transfers (Moxxi)", "$28,992", "2,521", "2,521", "$11.50"],
        ["Jade ACA", "$27,647", "2,633", "2,633", "$10.50"],
        ["Medicare Campaign C [SMILES]", "$23,573", "2,143", "2,143", "$11.00"],
        ["Medicare Campaign B [OUTBOUNDS]", "$19,421", "1,628", "1,628", "$11.93"],
        ["Medicare - Pitch Communications", "$14,238", "2,034", "2,034", "$7.00"],
        ["WHATIF", "$12,586", "1,798", "1,798", "$7.00"],
        ["Medicare Campaign A [INBOUNDS]", "$12,518", "1,138", "1,138", "$11.00"],
        ["TLD", "$6,685", "955", "955", "$7.00"],
        ["ELITE FYM", "$98", "14", "14", "$7.00"],
        ["Hospital Indemnity", "$75", "75", "75", "$1.00"],
        ["Medicare Campaign D [TCB]", "$44", "4", "4", "$11.00"],
        ["ACA FLOW", "$1", "1", "1", "$1.00"],
    ]

    y = draw_table(c, y, camp_headers, camp_rows, camp_widths, camp_aligns, highlight_col=1)

    draw_footer(c)
    c.showPage()

    # ═══════════════════════════════════════════
    # PAGE 2
    # ═══════════════════════════════════════════
    draw_bg(c)

    # Thin header bar on page 2
    c.setFillColor(HexColor("#080d16"))
    c.rect(0, H - 30, W, 30, fill=1, stroke=0)
    c.setStrokeColor(EMERALD)
    c.setLineWidth(1)
    c.line(0, H - 30, W, H - 30)
    c.setFont(MONO, 7)
    c.setFillColor(WHITE_50)
    c.drawString(MARGIN, H - 22, "RETREAVER REVENUE REPORT  \u2022  WEEK 1  \u2022  FEB 17\u201321, 2026")
    c.drawRightString(W - MARGIN, H - 22, "PAGE 2")

    y = H - 50

    # Revenue by Product Type
    y = draw_product_summary(c, y)

    # Key Metrics
    y = draw_key_metrics(c, y)

    # Notes
    y = draw_notes(c, y)

    draw_footer(c)
    c.showPage()
    c.save()
    print(f"PDF saved to: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
