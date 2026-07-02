// Static definition of every stage in the HSPU progression.
// row: 0 = Track A (balance) lane, 1 = merge/final lane, 2 = Track B (pressing) lane
// col: horizontal position (grid units)
// sub: fine-grained y offset within a row, for side branches (0 = on the main line)

const TRACKS = {
  A: { label: "Track A — Balance", color: "#3b82f6" },
  B: { label: "Track B — Pressing Strength", color: "#f59e0b" },
  M: { label: "Merged — Wall HSPU Sequence", color: "#8b5cf6" },
  F: { label: "Final — Freestanding HSPU", color: "#ef4444" },
  BG: { label: "Background / Ongoing", color: "#10b981" },
};

const STAGES = [
  // ---- Track A: Balance ----
  {
    id: "A1", track: "A", row: 0, col: 0, sub: 0,
    title: "Frog stand / crow pose",
    subtitle: "Knees on triceps",
    masteryCriteria: "Hold 30–60 sec controlled; comfortable falling out of it.",
    dependsOn: [],
  },
  {
    id: "A2", track: "A", row: 0, col: 1, sub: -1.05,
    title: "Crane pose",
    subtitle: "Straight-arm crow (optional)",
    masteryCriteria: "Hold 45–60 sec. Optional branch — builds straight-arm shoulder strength but is not required to continue.",
    dependsOn: ["A1"],
    optional: true,
  },
  {
    id: "A3", track: "A", row: 0, col: 1, sub: 0,
    title: "Wall handstand — chest-facing",
    subtitle: "Forces alignment",
    masteryCriteria: "Hold 3×30 sec with well-aligned body, no \"banana\" shape.",
    dependsOn: ["A1"],
  },
  {
    id: "A4", track: "A", row: 0, col: 2, sub: 0,
    title: "Wall handstand — back-facing",
    subtitle: "One-leg peel drills",
    masteryCriteria: "Hold chest-to-wall 60 sec; peel one foot off and hold 5 sec without wobbling.",
    dependsOn: ["A3"],
  },
  {
    id: "A5", track: "A", row: 0, col: 4, sub: 0,
    title: "Kick-up entry drill",
    subtitle: "Near wall, controlled",
    masteryCriteria: "5–10 successful kick-ups landing in a balanced handstand, held 1–3 sec each.",
    dependsOn: ["A4"],
  },
  {
    id: "A6", track: "A", row: 0, col: 5, sub: 0,
    title: "Freestanding tuck/straight-body hold",
    subtitle: "",
    masteryCriteria: "Consistent kick-up landing near vertical + a 5-second freestanding hold.",
    dependsOn: ["A5"],
  },
  {
    id: "A7", track: "A", row: 0, col: 6, sub: 0,
    title: "Freestanding handstand, endurance",
    subtitle: "",
    masteryCriteria: "Accumulate 60 sec/session of free-balance time; single holds 30–60 sec.",
    dependsOn: ["A6"],
  },

  // ---- Track B: Pressing Strength ----
  {
    id: "B1", track: "B", row: 2, col: 0, sub: -0.6,
    title: "Pike push-up",
    subtitle: "",
    masteryCriteria: "15–20 clean reps, head lightly touching floor each rep.",
    dependsOn: [],
  },
  {
    id: "B2", track: "B", row: 2, col: 0, sub: 0.6,
    title: "Tricep / close-grip push-up",
    subtitle: "Supporting strength",
    masteryCriteria: "8–10 reps with excellent form before progressing.",
    dependsOn: [],
  },
  {
    id: "B3", track: "B", row: 2, col: 2, sub: 0,
    title: "Elevated pike push-up",
    subtitle: "Feet on box, progressively higher",
    masteryCriteria: "10–15 reps at a meaningful elevation, controlled tempo.",
    dependsOn: ["B1", "B2"],
  },

  // ---- Merge point → Wall HSPU sequence ----
  {
    id: "C1", track: "M", row: 1, col: 3, sub: 0,
    title: "Wall handstand hold",
    subtitle: "Prerequisite check",
    masteryCriteria: "30–45 sec hold, ideally with a spotter/mats first.",
    dependsOn: ["A4", "B3"],
    gate: true,
  },
  {
    id: "C2", track: "M", row: 1, col: 4, sub: 0,
    title: "Pike handstand push-up off a box",
    subtitle: "Bent-knee, less than vertical",
    masteryCriteria: "3–5 sets × 5 reps with good form.",
    dependsOn: ["C1"],
  },
  {
    id: "C3", track: "M", row: 1, col: 5, sub: 0,
    title: "Wall HSPU — partial ROM",
    subtitle: "Ab mats/books/plates under head, removed over time",
    masteryCriteria: "Work down from 3 pads toward 0, controlling the descent each time.",
    dependsOn: ["C2"],
  },
  {
    id: "C4", track: "M", row: 1, col: 6, sub: 0,
    title: "Wall HSPU — negatives",
    subtitle: "Eccentric only",
    masteryCriteria: "~10 controlled reps on a slow 3–5 count descent.",
    dependsOn: ["C3"],
  },
  {
    id: "C5", track: "M", row: 1, col: 7, sub: 0,
    title: "Wall HSPU — small deficit",
    subtitle: "2 in / 5cm",
    masteryCriteria: "3–5 sets × 3 reps with at least a 2-inch deficit.",
    dependsOn: ["C4"],
  },
  {
    id: "C6", track: "M", row: 1, col: 8, sub: 0,
    title: "Full wall HSPU",
    subtitle: "Strict, full ROM, chest-to-wall",
    masteryCriteria: "5+ strict full-range-of-motion back-to-wall HSPU before chasing deficit/freestanding work.",
    dependsOn: ["C5"],
  },

  // ---- Final stage ----
  {
    id: "D1", track: "F", row: 1, col: 9, sub: 0,
    title: "Freestanding HSPU — single rep",
    subtitle: "",
    masteryCriteria: "First goal is one strict rep, then build volume from there.",
    dependsOn: ["C6", "A7"],
    gate: true,
  },
  {
    id: "D2", track: "F", row: 1, col: 10, sub: 0,
    title: "Freestanding HSPU — sets",
    subtitle: "End goal",
    masteryCriteria: "3–5 clean reps for a set.",
    dependsOn: ["D1"],
  },

  // ---- Background / ongoing (no dependency graph) ----
  {
    id: "BG1", track: "BG", row: null, col: null, sub: 0,
    title: "Wrist mobility",
    subtitle: "Ongoing",
    masteryCriteria: "Pain-free full weight-bearing wrist extension; no discomfort during holds.",
    dependsOn: [],
  },
  {
    id: "BG2", track: "BG", row: null, col: null, sub: 0,
    title: "Shoulder flexibility",
    subtitle: "Overhead + pike stretch, ongoing",
    masteryCriteria: "Comfortable fully overhead position (biceps by ears) and deep pike fold.",
    dependsOn: [],
  },
  {
    id: "BG3", track: "BG", row: null, col: null, sub: 0,
    title: "Hollow body hold",
    subtitle: "Ongoing",
    masteryCriteria: "Hold 45–60 sec with lower back pressed to floor, no arch.",
    dependsOn: [],
  },
];
