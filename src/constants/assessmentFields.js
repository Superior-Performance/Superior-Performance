/**
 * The assessment intake schema: what the form asks, what counts as a finding
 * worth prioritising, and the arc-of-motion numbers derived from it.
 *
 * Moved out of AdminAthleteDetail so the sheet script, the history view, the
 * priority ranking and the tests all read one definition instead of four
 * copies drifting apart.
 *
 * Column order in the Assessment Intake sheet is positional (the Apps Script
 * maps `columns[i]` to the i-th cell), so **new fields are only ever appended
 * to SHEET_COLUMNS** — never inserted, never removed. Retired fields keep
 * their column forever, empty, because deleting one shifts every cell to its
 * right on every future row.
 */
export const PASS_FAIL = ['Pass', 'Fail']
export const YES_NO = ['Yes', 'No']
export const FULL_LIMITED_SIDES = ['Full', 'Limited (bilateral)', 'Limited (left)', 'Limited (right)']

export const FIELD_GROUPS = [
  {
    title: 'General',
    fields: [
      { key: 'assessmentDate', label: 'Assessment Date', type: 'date' },
      { key: 'age',            label: 'Age',             type: 'number' },
      { key: 'ageBracket',     label: 'Age Bracket',      type: 'select', options: ['14u', '15u', '16u', '17u', '18u', 'College'] },
      { key: 'trainingAge',    label: 'Training Age (yrs lifting)', type: 'number' },
      { key: 'sportPosition',  label: 'Sport / Position', type: 'text' },
      { key: 'handedness',     label: 'Handedness',       type: 'select', options: ['Left', 'Right'] },
      { key: 'injuryHistory',  label: 'Injury History / Pain (red flags)', type: 'text', wide: true },
    ],
  },
  {
    title: 'Program Planning',
    fields: [
      { key: 'mode',                label: 'Mode',            type: 'select', options: ['In-House', 'Remote'] },
      { key: 'programLengthWeeks',  label: 'Program Length',  type: 'select', options: ['4 weeks', '8 weeks', '12 weeks'] },
      { key: 'trainingPhase',       label: 'Training Phase',  type: 'select', options: ['On-Ramp', 'In-Season', 'Off-Season'] },
    ],
  },
  {
    title: 'ISA',
    fields: [
      { key: 'isaReading',       label: 'ISA Reading',                type: 'select', options: ['Neutral', 'Narrow', 'Wide'] },
      { key: 'compressionSigns', label: 'Compression Signs (ISA test)', type: 'select', options: ['Not compressed', 'Slightly compressed', 'Compressed'] },
    ],
  },
  {
    title: 'Shoulder',
    fields: [
      // Passive ER, unchanged and still degrees. Deliberately kept alongside
      // the new active measurements — they are different tests, not a rename.
      { key: 'shoulderERLeft',            label: 'Passive Shoulder ER - Left (deg)',  type: 'number' },
      { key: 'shoulderERRight',           label: 'Passive Shoulder ER - Right (deg)', type: 'number' },
      { key: 'activeShoulderERLeft',      label: 'Active Shoulder ER - Left (deg)',   type: 'number' },
      { key: 'activeShoulderERRight',     label: 'Active Shoulder ER - Right (deg)',  type: 'number' },
      { key: 'shoulderIRLeft',            label: 'Shoulder IR - Left (deg)',          type: 'number' },
      { key: 'shoulderIRRight',           label: 'Shoulder IR - Right (deg)',         type: 'number' },
      { key: 'shoulderFlexion',           label: 'Shoulder Flexion', type: 'select', options: FULL_LIMITED_SIDES },
    ],
  },
  {
    title: 'Hip',
    fields: [
      { key: 'seatedHipERLeft',   label: 'Seated Hip ER - Left (deg)',   type: 'number' },
      { key: 'seatedHipERRight',  label: 'Seated Hip ER - Right (deg)',  type: 'number' },
      { key: 'seatedHipIRLeft',   label: 'Seated Hip IR - Left (deg)',   type: 'number' },
      { key: 'seatedHipIRRight',  label: 'Seated Hip IR - Right (deg)',  type: 'number' },
      { key: 'proneHipERLeft',    label: 'Prone Hip ER - Left (deg)',    type: 'number' },
      { key: 'proneHipERRight',   label: 'Prone Hip ER - Right (deg)',   type: 'number' },
      { key: 'proneHipIRLeft',    label: 'Prone Hip IR - Left (deg)',    type: 'number' },
      { key: 'proneHipIRRight',   label: 'Prone Hip IR - Right (deg)',   type: 'number' },
      { key: 'hipExtension',      label: 'Hip Extension (table test)', type: 'select', options: FULL_LIMITED_SIDES },
    ],
  },
  {
    title: 'Lower Body',
    fields: [
      { key: 'hamstringTest',          label: 'Hamstring Test',            type: 'select', options: PASS_FAIL },
      { key: 'splitsTest',             label: 'Splits Test',               type: 'select', options: PASS_FAIL },
      { key: 'ankleDorsiflexionLeft',  label: 'Ankle Dorsiflexion - Left',  type: 'select', options: PASS_FAIL },
      { key: 'ankleDorsiflexionRight', label: 'Ankle Dorsiflexion - Right', type: 'select', options: PASS_FAIL },
    ],
  },
  {
    title: 'T-Spine',
    fields: [
      { key: 'tSpineRotationLeft',  label: 'T-Spine Rotation - Left (deg)',  type: 'number' },
      { key: 'tSpineRotationRight', label: 'T-Spine Rotation - Right (deg)', type: 'number' },
      { key: 'tSpineExtension', label: 'T-Spine Extension', type: 'select', options: ['Full', 'Limited'] },
      { key: 'tSpineFlexion',   label: 'T-Spine Flexion',   type: 'select', options: ['Full', 'Limited'] },
    ],
  },
  {
    title: 'Elbow / Forearm',
    fields: [
      { key: 'pecTest',                 label: 'Pec Test',                 type: 'select', options: PASS_FAIL },
      { key: 'elbowPainType',           label: 'Elbow Pain Type',          type: 'select', options: ['None', 'Olecranon', 'Tennis elbow', 'Both'] },
      { key: 'flexorForearmTightness',  label: 'Flexor Forearm Tightness', type: 'select', options: PASS_FAIL },
    ],
  },
  {
    title: 'Posture & Notes',
    fields: [
      { key: 'ribFlare',          label: 'Rib Flare',              type: 'select', options: YES_NO },
      { key: 'scapControl',       label: 'Scap Control / Winging', type: 'text' },
      { key: 'postureFeet',       label: 'Posture - Feet',         type: 'text' },
      { key: 'posturePelvis',     label: 'Posture - Pelvis',       type: 'text' },
      { key: 'postureUpperBody',  label: 'Posture - Upper Body',   type: 'text' },
      { key: 'otherNotes',        label: 'Other Notes',            type: 'text', wide: true },
    ],
  },
]

export const ALL_FIELDS = FIELD_GROUPS.flatMap(g => g.fields)

/**
 * Fields the form no longer asks for, kept so history recorded before the
 * change still renders with its real labels instead of disappearing. Every
 * assessment taken before 2026-09-22 has these, including the 23 entries
 * backfilled from the intake sheet.
 */
export const RETIRED_FIELDS = [
  { key: 'activeShoulderERTestLeft',  label: 'Active Shoulder ER Test - Left (retired)',  type: 'select', options: PASS_FAIL },
  { key: 'activeShoulderERTestRight', label: 'Active Shoulder ER Test - Right (retired)', type: 'select', options: PASS_FAIL },
  { key: 'shoulderIRLimitedLeft',     label: 'Shoulder IR Limited - Left (retired)',  type: 'select', options: YES_NO },
  { key: 'shoulderIRLimitedRight',    label: 'Shoulder IR Limited - Right (retired)', type: 'select', options: YES_NO },
  { key: 'hipIRLimitedLeft',          label: 'Hip IR Limited - Left (retired)',  type: 'select', options: YES_NO },
  { key: 'hipIRLimitedRight',         label: 'Hip IR Limited - Right (retired)', type: 'select', options: YES_NO },
  { key: 'hipERLimitedLeft',          label: 'Hip ER Limited - Left (retired)',  type: 'select', options: YES_NO },
  { key: 'hipERLimitedRight',         label: 'Hip ER Limited - Right (retired)', type: 'select', options: YES_NO },
  { key: 'tSpineRotation',            label: 'T-Spine Rotation (retired)', type: 'select', options: [...FULL_LIMITED_SIDES, 'Limited (glove side)'] },
]

/**
 * Sheet column order — positional, append-only. The first 41 entries are the
 * original columns in their original places, including the nine now retired:
 * removing a column would shift every cell to its right on every future row,
 * and the Sheet's programming algorithm reads by position too.
 */
export const SHEET_COLUMNS = [
  'athleteName', 'assessmentDate', 'age', 'ageBracket', 'trainingAge',
  'sportPosition', 'handedness', 'injuryHistory', 'isaReading', 'compressionSigns',
  'shoulderERLeft', 'shoulderERRight', 'activeShoulderERTestLeft', 'activeShoulderERTestRight',
  'shoulderIRLimitedLeft', 'shoulderIRLimitedRight', 'hipIRLimitedLeft', 'hipIRLimitedRight',
  'hipERLimitedLeft', 'hipERLimitedRight', 'hipExtension', 'hamstringTest', 'splitsTest',
  'ankleDorsiflexionLeft', 'ankleDorsiflexionRight', 'shoulderFlexion', 'tSpineRotation',
  'tSpineExtension', 'tSpineFlexion', 'pecTest', 'elbowPainType', 'flexorForearmTightness',
  'ribFlare', 'scapControl', 'postureFeet', 'posturePelvis', 'postureUpperBody', 'otherNotes',
  'mode', 'trainingPhase', 'programLengthWeeks',
  // Appended 2026-09-22 — degree fields, arcs and priority ranking.
  'activeShoulderERLeft', 'activeShoulderERRight', 'shoulderIRLeft', 'shoulderIRRight',
  'tSpineRotationLeft', 'tSpineRotationRight',
  'seatedHipERLeft', 'seatedHipERRight', 'seatedHipIRLeft', 'seatedHipIRRight',
  'proneHipERLeft', 'proneHipERRight', 'proneHipIRLeft', 'proneHipIRRight',
  'totalArcShoulderLeft', 'totalArcShoulderRight',
  'totalArcSeatedHipLeft', 'totalArcSeatedHipRight',
  'totalArcProneHipLeft', 'totalArcProneHipRight',
  'priorityRanking', 'priorityNote',
]

/**
 * Dropdown values that count as a finding worth ranking.
 *
 * Matched case-insensitively against the selected value, so "Limited
 * (bilateral)" and "Limited (left)" both flag without listing every variant.
 * Degree fields deliberately never flag yet — the thresholds for those are
 * being decided on Ian's side, and guessing a number here would put made-up
 * clinical judgement in front of a coach. Add them to FLAG_THRESHOLDS when
 * they land.
 */
export const FLAG_VALUE_PATTERNS = [/limited/i, /^fail$/i, /^yes$/i, /compressed/i, /flared?$/i, /^mild/i]

/** key -> { max } or { min }: a degree reading outside this counts as flagged. */
export const FLAG_THRESHOLDS = {}

export function isFlaggedValue(field, value) {
  if (value === undefined || value === null || String(value).trim() === '') return false
  const str = String(value).trim()

  if (field?.type === 'number') {
    const t = FLAG_THRESHOLDS[field.key]
    if (!t) return false // no threshold agreed yet — see FLAG_THRESHOLDS
    const n = Number(str)
    if (!Number.isFinite(n)) return false
    return (t.max !== undefined && n > t.max) || (t.min !== undefined && n < t.min)
  }

  // "Not compressed" contains "compressed" — check the negation first.
  if (/^not\b/i.test(str) || /^no$/i.test(str) || /^none$/i.test(str)) return false
  return FLAG_VALUE_PATTERNS.some(re => re.test(str))
}

/** Every flagged finding in an assessment, in form order. */
export function flaggedFindings(assessment, fields = ALL_FIELDS) {
  return fields
    .filter(f => isFlaggedValue(f, assessment?.[f.key]))
    .map(f => ({ key: f.key, label: f.label, value: String(assessment[f.key]).trim() }))
}

/**
 * Total arc of motion: ER + IR, per joint and position, per side.
 *
 * Three separate measures — shoulder, seated hip, prone hip — deliberately
 * never combined with each other. Computed on save and stored on the
 * assessment; never shown on the form, which is why these keys are not in
 * FIELD_GROUPS.
 *
 * A side with either half missing yields no number rather than a misleading
 * half-arc.
 */
export const TOTAL_ARCS = [
  { key: 'totalArcShoulderLeft',   label: 'Total Arc - Shoulder (Left)',    er: 'activeShoulderERLeft',  ir: 'shoulderIRLeft' },
  { key: 'totalArcShoulderRight',  label: 'Total Arc - Shoulder (Right)',   er: 'activeShoulderERRight', ir: 'shoulderIRRight' },
  { key: 'totalArcSeatedHipLeft',  label: 'Total Arc - Seated Hip (Left)',  er: 'seatedHipERLeft',       ir: 'seatedHipIRLeft' },
  { key: 'totalArcSeatedHipRight', label: 'Total Arc - Seated Hip (Right)', er: 'seatedHipERRight',      ir: 'seatedHipIRRight' },
  { key: 'totalArcProneHipLeft',   label: 'Total Arc - Prone Hip (Left)',   er: 'proneHipERLeft',        ir: 'proneHipIRLeft' },
  { key: 'totalArcProneHipRight',  label: 'Total Arc - Prone Hip (Right)',  er: 'proneHipERRight',       ir: 'proneHipIRRight' },
]

export function computeTotalArcs(assessment) {
  const out = {}
  for (const arc of TOTAL_ARCS) {
    const er = Number(assessment?.[arc.er])
    const ir = Number(assessment?.[arc.ir])
    if (!Number.isFinite(er) || !Number.isFinite(ir)) continue
    if (String(assessment[arc.er]).trim() === '' || String(assessment[arc.ir]).trim() === '') continue
    out[arc.key] = er + ir
  }
  return out
}
