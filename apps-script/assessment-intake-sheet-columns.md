<!--
Written by Skip (Ian's Claude), 2026-09-22, and moved here so it sits next to
the script it belongs to.

The 22 new headers, the 9 retired ones and every column letter were checked
against SHEET_COLUMNS in src/constants/assessmentFields.js — all 31 rows match
by position and by letter. If you change that array, re-check this file; the
sheet, the Apps Script and the app all map these columns positionally, so they
have to agree.
-->

# Assessment Intake sheet — new columns for Priority Ranking + Degree Fields

Atlas (Jake's Claude) shipped both changes to the real Assessment Intake page
on `superior-performance-ba102.web.app` on 2026-09-22 — see the Team Chat
thread for the full rollout notes. This file is just the sheet-side action
item: the 22 new column headers that need to be added to the Assessment
Intake Google Sheet before Jake pastes the updated Apps Script.

## Add these 22 headers, columns 42–63, in exactly this order

| Col # | Letter | Header |
|---|---|---|
| 42 | AP | `activeShoulderERLeft` |
| 43 | AQ | `activeShoulderERRight` |
| 44 | AR | `shoulderIRLeft` |
| 45 | AS | `shoulderIRRight` |
| 46 | AT | `tSpineRotationLeft` |
| 47 | AU | `tSpineRotationRight` |
| 48 | AV | `seatedHipERLeft` |
| 49 | AW | `seatedHipERRight` |
| 50 | AX | `seatedHipIRLeft` |
| 51 | AY | `seatedHipIRRight` |
| 52 | AZ | `proneHipERLeft` |
| 53 | BA | `proneHipERRight` |
| 54 | BB | `proneHipIRLeft` |
| 55 | BC | `proneHipIRRight` |
| 56 | BD | `totalArcShoulderLeft` |
| 57 | BE | `totalArcShoulderRight` |
| 58 | BF | `totalArcSeatedHipLeft` |
| 59 | BG | `totalArcSeatedHipRight` |
| 60 | BH | `totalArcProneHipLeft` |
| 61 | BI | `totalArcProneHipRight` |
| 62 | BJ | `priorityRanking` |
| 63 | BK | `priorityNote` |

## Do NOT touch these — they're retired, not deleted

Columns M–T (13–20) and AA (27) stay exactly where they are and just go
empty going forward:

- 13 (M) `activeShoulderERTestLeft`
- 14 (N) `activeShoulderERTestRight`
- 15 (O) `shoulderIRLimitedLeft`
- 16 (P) `shoulderIRLimitedRight`
- 17 (Q) `hipIRLimitedLeft`
- 18 (R) `hipIRLimitedRight`
- 19 (S) `hipERLimitedLeft`
- 20 (T) `hipERLimitedRight`
- 27 (AA) `tSpineRotation`

The Apps Script maps columns by position, so deleting or reordering any of
these shifts every cell to its right on every future row.

## Order of operations (per Atlas)

1. Add the 22 headers above to the sheet.
2. Jake pastes the updated Apps Script (its column list has to match).
3. App deploy (already shipped, waiting on 1 and 2 to actually line up).

If the app goes live before the sheet is updated, new fields just don't
reach the sheet until the script catches up — nothing corrupts either way.

## Still open, not part of this file

Flagging thresholds for the new degree fields (what counts as "flagged" for
Priority Ranking, e.g. what angle on `shoulderIRLeft` should flag) — that's
the coach's clinical judgment call, being worked out separately. Don't wire
these into anything until real per-field min/max numbers exist.
