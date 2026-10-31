"""Generate a MOCK manual test script (Excel) for the Batch Statistics example.

Fictional company, system and people. It imitates a typical hand-executed
script, including the flaws such scripts often have, so the Excel-to-protocol
conversion has something real to deal with:
  - step 2's expected SD / CV% were typed from a STDEV.P formula, while the
    requirement says sample SD (n-1);
  - step 3's expected result is vague ("shown with 3 decimals");
  - step 10 (print the page) cannot be automated;
  - step 11 ("verify everything is displayed correctly") is not a checkable step.

Run inside a virtual environment:  python make_mock_xlsx.py [out.xlsx]
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

OUT = sys.argv[1] if len(sys.argv) > 1 else "TS-STAT-001_Batch-Statistics.xlsx"

thin = Side(style="thin", color="999999")
box = Border(left=thin, right=thin, top=thin, bottom=thin)
head_fill = PatternFill("solid", fgColor="D9E2EC")
grey = PatternFill("solid", fgColor="F2F2F2")
wrap = Alignment(wrap_text=True, vertical="top")
bold = Font(bold=True)

wb = Workbook()

# ---------------------------------------------------------------- Test Script
ws = wb.active
ws.title = "Test Script"
meta = [
    ("Document", "TS-STAT-001  Test Script: Batch Statistics Calculations"),
    ("Version", "2.0"),
    ("System", "Batch Statistics (Northwind Analytics, fictional)  v2.3.0"),
    ("Environment", "Test: http://127.0.0.1:4174/good/  ·  browser: Chrome  ·  screen 1280×800"),
    ("Requirements", "URS-STAT-01 … URS-STAT-07 (see sheet 'Requirements')"),
    ("Prerequisites", "Test data sets A–F on sheet 'Test Data'. No login required."),
    ("Instructions", "Execute each step in order. Record the actual result, Pass/Fail, take a screenshot "
                     "named TS-STAT-001_<step>.png and initial/date each step."),
]
for i, (k, v) in enumerate(meta, start=1):
    ws.cell(row=i, column=1, value=k).font = bold
    ws.cell(row=i, column=1).fill = grey
    ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=8)
    ws.cell(row=i, column=2, value=v).alignment = wrap

HEAD = ["Step", "Req ID", "Test Instruction", "Expected Result", "Actual Result", "Pass / Fail", "Evidence", "Executed by / Date"]
hr = len(meta) + 2
for c, h in enumerate(HEAD, start=1):
    cell = ws.cell(row=hr, column=c, value=h)
    cell.font, cell.fill, cell.border, cell.alignment = bold, head_fill, box, wrap

STEPS = [
    ("URS-STAT-01", "Open the Batch Statistics application (URL in Environment above).",
     "The 'Batch statistics' page is displayed. The header shows Version 2.3.0. All result fields show '—'."),
    ("URS-STAT-02", "Enter Data Set A into the Measurements field. Leave Decimal places at 2. Click Calculate.",
     "n = 5\nMean = 10.00\nSD = 0.28\nCV % = 2.83\nMedian = 10.00\nMin = 9.60\nMax = 10.40"),
    ("URS-STAT-03", "Change Decimal places to 3. Click Calculate.",
     "Results are shown with 3 decimals."),
    ("URS-STAT-04", "Set Decimal places to 2. Replace the measurements with Data Set B. Click Calculate.",
     "n = 2\nMean = 1.01 (1.005 rounds up)\nSD = 0.01\nCV % = 0.70\nMedian = 1.01\nMin = 1.00\nMax = 1.01"),
    ("URS-STAT-02", "Replace the measurements with Data Set C (even number of values). Click Calculate.",
     "n = 4\nMean = 2.50\nSD = 1.29\nCV % = 51.64\nMedian = 2.50\nMin = 1.00\nMax = 4.00"),
    ("URS-STAT-05", "Replace the measurements with Data Set D (one value). Click Calculate.",
     "n = 1\nMean = 5.00\nSD and CV % are not calculated (shown as '—')\nMedian = 5.00"),
    ("URS-STAT-05", "Replace the measurements with Data Set E (mean is zero). Click Calculate.",
     "n = 2\nMean = 0.00\nSD = 1.41\nCV % is not calculated (shown as '—')"),
    ("URS-STAT-06", "Replace the measurements with Data Set F (contains text). Click Calculate.",
     "An error message identifies the invalid value. No results are shown."),
    ("URS-STAT-06", "Clear the Measurements field. Click Calculate.",
     "An error message asks for at least one value. No results are shown."),
    ("URS-STAT-07", "Print the results page (File > Print) and attach the printout.",
     "Printout shows the same results as the screen."),
    ("URS-STAT-02", "Verify all results are displayed correctly.",
     "All results displayed correctly."),
]
for i, (req, instr, exp) in enumerate(STEPS, start=1):
    r = hr + i
    for c, v in enumerate([i, req, instr, exp, "", "", "", ""], start=1):
        cell = ws.cell(row=r, column=c, value=v)
        cell.border, cell.alignment = box, wrap
    ws.row_dimensions[r].height = max(30, 15 * (exp.count("\n") + 1))

end = hr + len(STEPS) + 2
for k, label in enumerate(["Executed by", "Reviewed by", "Approved by"]):
    ws.cell(row=end + k, column=1, value=label).font = bold
    ws.cell(row=end + k, column=2, value="Name / Signature / Date: ____________________")

for col, w in zip("ABCDEFGH", [7, 13, 46, 34, 26, 10, 12, 18]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = ws.cell(row=hr + 1, column=1)

# ---------------------------------------------------------------- Test Data
td = wb.create_sheet("Test Data")
DATA = {
    "A": [10.2, 9.8, 10.0, 10.4, 9.6],
    "B": [1.00, 1.01],
    "C": [1, 2, 3, 4],
    "D": [5],
    "E": [-1, 1],
    "F": ["10", "abc", "12"],
}
td.append(["Data set", "Purpose", "Values (enter separated by commas)", "", "Expected n", "Expected mean", "Expected SD"])
for c in td[1]:
    c.font, c.fill = bold, head_fill
purposes = {"A": "Typical QC batch", "B": "Rounding: mean is exactly 1.005", "C": "Even count: median is the average of the middle two",
            "D": "Single value", "E": "Mean of zero", "F": "Invalid entry"}
for k, (name, vals) in enumerate(DATA.items(), start=2):
    td.cell(row=k, column=1, value=name)
    td.cell(row=k, column=2, value=purposes[name])
    td.cell(row=k, column=3, value=", ".join(f"{v:.2f}" if isinstance(v, float) else str(v) for v in vals))
    if name in ("A", "C"):
        # the values again, one per cell, so the author's formulas can use them
        for j, v in enumerate(vals):
            td.cell(row=k, column=9 + j, value=v)
        last = chr(ord("I") + len(vals) - 1)
        td.cell(row=k, column=5, value=f"=COUNT(I{k}:{last}{k})")
        td.cell(row=k, column=6, value=f"=ROUND(AVERAGE(I{k}:{last}{k}),2)")
        # the author's mistake: population SD, while URS-STAT-02 asks for sample SD
        td.cell(row=k, column=7, value=f"=ROUND(STDEV.P(I{k}:{last}{k}),2)" if name == "A" else f"=ROUND(STDEV.S(I{k}:{last}{k}),2)")
for col, w in zip("ABCDEFG", [9, 44, 34, 2, 11, 14, 12]):
    td.column_dimensions[col].width = w

# ---------------------------------------------------------------- Requirements
rq = wb.create_sheet("Requirements")
rq.append(["Req ID", "Requirement"])
for c in rq[1]:
    c.font, c.fill = bold, head_fill
for row in [
    ("URS-STAT-01", "The application shows the batch statistics page with the software version."),
    ("URS-STAT-02", "For the entered measurements the application shows n, mean, sample standard deviation (n−1), "
                    "CV % (SD / |mean| × 100), median, minimum and maximum."),
    ("URS-STAT-03", "Results are rounded to the selected number of decimal places (1, 2 or 3)."),
    ("URS-STAT-04", "Rounding is half away from zero on the decimal value (as Excel ROUND): 1.005 → 1.01."),
    ("URS-STAT-05", "SD is not calculated for fewer than 2 values; CV % is not calculated when SD is not calculated "
                    "or the mean is zero. Values not calculated are shown as '—'."),
    ("URS-STAT-06", "Invalid or empty input shows an error message identifying the problem, and no results are shown."),
    ("URS-STAT-07", "The results page can be printed."),
]:
    rq.append(row)
rq.column_dimensions["A"].width = 14
rq.column_dimensions["B"].width = 110
for r in rq.iter_rows(min_row=2):
    for c in r:
        c.alignment = wrap

wb.save(OUT)
print(OUT)
