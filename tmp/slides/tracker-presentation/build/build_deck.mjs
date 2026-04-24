import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const W = 1280;
const H = 720;

const DECK_ID = "tracker-presentation";
const ROOT_DIR = path.resolve("C:/Users/culle/OneDrive/Desktop/ChinaTracker");
const SCREENSHOT_DIR = path.join(ROOT_DIR, "tmp", "slides", DECK_ID, "screenshots");
const OUT_DIR = path.join(ROOT_DIR, "tmp", "slides", DECK_ID, "output");
const SCRATCH_DIR = path.join(ROOT_DIR, "tmp", "slides", DECK_ID);
const PREVIEW_DIR = path.join(SCRATCH_DIR, "preview");
const VERIFY_DIR = path.join(SCRATCH_DIR, "verification");
const INSPECT_PATH = path.join(SCRATCH_DIR, "inspect.ndjson");
const FINAL_PPTX = path.join(ROOT_DIR, "Tracker Presentation.pptx");

const COLORS = {
  navy: "#0B1830",
  navy2: "#102548",
  ink: "#13243B",
  slate: "#516177",
  mist: "#EAF0F8",
  panel: "#F8FBFF",
  line: "#D6DFEC",
  white: "#FFFFFF",
  blue: "#2B78FF",
  blueSoft: "#DCEBFF",
  teal: "#1CB7A6",
  tealSoft: "#D9F6F2",
  gold: "#F3B94D",
  goldSoft: "#FFF2D9",
  coral: "#FF7B6B",
  coralSoft: "#FFE6E2",
  success: "#2F9E6F",
  transparent: "#00000000",
};

const FONT = {
  title: "Aptos Display",
  body: "Aptos",
  mono: "Aptos Mono",
};

const SHOTS = {
  dashboard: path.join(SCREENSHOT_DIR, "dashboard.png"),
  unit: path.join(SCREENSHOT_DIR, "unit-a7.png"),
  reports: path.join(SCREENSHOT_DIR, "reports-balance.png"),
  refinements: path.join(SCREENSHOT_DIR, "refinements.png"),
};

const inspectRecords = [];

const SLIDE_NOTES = {
  1: "Open with the mission: this is the transition from spreadsheet budgeting to a live, briefing-ready planning surface. Briefly point to the three screenshots as proof the product already spans executive view, unit planning, and reporting.",
  2: "Walk through the five steps from left to right. Emphasize that the app follows the planning rhythm users already know, but the rollups and calculations happen automatically in the background.",
  3: "Keep this leadership-focused. The message is not that Excel is bad; it is that spreadsheets become fragile when the audience expects shared logic, speed, and a defensible briefing trail.",
  4: "Use this slide to summarize what matters operationally: real-time totals, structured unit inputs, reporting, refinements, and safety controls like clear actions and undo.",
  5: "During the live portion, show how leadership can read total cost, funding split, unit table, and visual charts from one screen. This is the fastest way to orient a room.",
  6: "This slide shows that the same data model supports detailed unit planning and polished reporting. It also highlights that follow-up work can now be tracked inside the tool instead of on side notes.",
  7: "Frame the roadmap as realistic extensions of the current foundation: approvals, scenario management, portfolio visibility, and decision support. The point is that the current app can grow into a platform.",
  8: "Close on outcomes: faster decisions, better traceability, and cleaner leadership briefings. This should leave the audience with confidence that the app is useful now and expandable later.",
};

function normalizeText(text) {
  return String(text ?? "");
}

function textLines(text) {
  return Math.max(1, normalizeText(text).split(/\n/).length);
}

function requiredHeight(text, size, lineHeight = 1.16) {
  return textLines(text) * size * lineHeight;
}

function line(fill = COLORS.transparent, width = 0) {
  return { style: "solid", fill, width };
}

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  await fs.mkdir(VERIFY_DIR, { recursive: true });
}

async function readImageBlob(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function record(kind, payload) {
  inspectRecords.push({ kind, ...payload });
}

function addShape(slide, slideNo, geometry, left, top, width, height, fill, stroke = COLORS.transparent, strokeWidth = 0, role = geometry) {
  const shape = slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill,
    line: line(stroke, strokeWidth),
  });
  record("shape", { slide: slideNo, role, bbox: [left, top, width, height] });
  return shape;
}

function addText(
  slide,
  slideNo,
  text,
  left,
  top,
  width,
  height,
  {
    size = 20,
    color = COLORS.ink,
    face = FONT.body,
    bold = false,
    align = "left",
    valign = "top",
    fill = COLORS.transparent,
    stroke = COLORS.transparent,
    strokeWidth = 0,
    role = "text",
  } = {},
) {
  if (height < requiredHeight(text, size) - 2) {
    throw new Error(`Text box for ${role} is too short on slide ${slideNo}: "${normalizeText(text).slice(0, 80)}"`);
  }
  const shape = addShape(slide, slideNo, "rect", left, top, width, height, fill, stroke, strokeWidth, role);
  shape.text = text;
  shape.text.fontSize = size;
  shape.text.color = color;
  shape.text.bold = bold;
  shape.text.typeface = face;
  shape.text.alignment = align;
  shape.text.verticalAlignment = valign;
  shape.text.insets = { left: 0, right: 0, top: 0, bottom: 0 };
  record("textbox", {
    slide: slideNo,
    role,
    text: normalizeText(text),
    textChars: normalizeText(text).length,
    textLines: textLines(text),
    bbox: [left, top, width, height],
  });
  return shape;
}

async function addImage(slide, slideNo, imagePath, left, top, width, height, fit = "contain", role = "image") {
  const image = slide.images.add({
    blob: await readImageBlob(imagePath),
    fit,
    alt: `${role} for slide ${slideNo}`,
  });
  image.position = { left, top, width, height };
  record("image", { slide: slideNo, role, path: imagePath, bbox: [left, top, width, height] });
  return image;
}

function addSpeakerNotes(slide, slideNo) {
  slide.speakerNotes.setText(`${SLIDE_NOTES[slideNo]}\n\nSources:\n- README.md\n- USER_GUIDE.md\n- ChinaTracker_PRD_v2.md`);
}

function addDarkBackdrop(slide, slideNo) {
  slide.background.fill = COLORS.navy;
  addShape(slide, slideNo, "ellipse", -110, -80, 360, 360, "#153A7340", COLORS.transparent, 0, "backdrop glow");
  addShape(slide, slideNo, "ellipse", 1010, -120, 330, 330, "#1CB7A630", COLORS.transparent, 0, "backdrop glow");
  addShape(slide, slideNo, "ellipse", 980, 510, 380, 380, "#2B78FF20", COLORS.transparent, 0, "backdrop glow");
  addShape(slide, slideNo, "roundRect", 34, 28, W - 68, H - 56, "#FFFFFF06", "#FFFFFF18", 1.2, "frame");
}

function addLightBackdrop(slide, slideNo) {
  slide.background.fill = "#F3F7FC";
  addShape(slide, slideNo, "ellipse", -120, -120, 360, 360, "#DCEBFF", COLORS.transparent, 0, "backdrop glow");
  addShape(slide, slideNo, "ellipse", 1030, -90, 260, 260, "#D9F6F2", COLORS.transparent, 0, "backdrop glow");
  addShape(slide, slideNo, "ellipse", 980, 560, 280, 280, "#FFF2D9", COLORS.transparent, 0, "backdrop glow");
}

function addHeader(slide, slideNo, kicker, labelColor = COLORS.blue) {
  addText(slide, slideNo, kicker.toUpperCase(), 70, 40, 280, 18, {
    size: 12,
    color: labelColor,
    face: FONT.mono,
    bold: true,
    role: "kicker",
  });
  addText(slide, slideNo, `${String(slideNo).padStart(2, "0")} / 08`, 1080, 40, 120, 18, {
    size: 12,
    color: labelColor,
    face: FONT.mono,
    bold: true,
    align: "right",
    role: "slide index",
  });
}

function addTitle(slide, slideNo, title, subtitle, dark = false) {
  addText(slide, slideNo, title, 70, 78, 690, 116, {
    size: 34,
    color: dark ? COLORS.white : COLORS.ink,
    face: FONT.title,
    bold: true,
    role: "title",
  });
  addText(slide, slideNo, subtitle, 72, 190, 680, 64, {
    size: 18,
    color: dark ? "#D8E2F0" : COLORS.slate,
    face: FONT.body,
    role: "subtitle",
  });
}

function addPill(slide, slideNo, left, top, width, text, fill, color, role = "pill") {
  addShape(slide, slideNo, "roundRect", left, top, width, 30, fill, COLORS.transparent, 0, `${role} panel`);
  addText(slide, slideNo, text, left + 14, top + 7, width - 28, 16, {
    size: 11,
    color,
    face: FONT.mono,
    bold: true,
    align: "center",
    role,
  });
}

function addBulletBlock(slide, slideNo, left, top, width, items, dark = false) {
  const dotColor = dark ? COLORS.teal : COLORS.blue;
  let y = top;
  for (const item of items) {
    addShape(slide, slideNo, "ellipse", left, y + 7, 8, 8, dotColor, COLORS.transparent, 0, "bullet dot");
    addText(slide, slideNo, item, left + 20, y, width - 20, 42, {
      size: 17,
      color: dark ? COLORS.white : COLORS.ink,
      face: FONT.body,
      role: "bullet",
    });
    y += 48;
  }
}

function addOutcomeCard(slide, slideNo, left, top, width, title, body, accentFill, iconText, dark = false) {
  addShape(slide, slideNo, "roundRect", left, top, width, 136, dark ? "#11284B" : COLORS.white, dark ? "#2A466A" : COLORS.line, 1.2, `${title} card`);
  addShape(slide, slideNo, "ellipse", left + 22, top + 20, 42, 42, accentFill, COLORS.transparent, 0, "icon circle");
  addText(slide, slideNo, iconText, left + 34, top + 28, 18, 18, {
    size: 14,
    color: dark ? COLORS.navy : COLORS.ink,
    face: FONT.mono,
    bold: true,
    align: "center",
    role: "icon text",
  });
  addText(slide, slideNo, title, left + 78, top + 20, width - 96, 24, {
    size: 18,
    color: dark ? COLORS.white : COLORS.ink,
    face: FONT.title,
    bold: true,
    role: "card title",
  });
  addText(slide, slideNo, body, left + 24, top + 68, width - 48, 46, {
    size: 15,
    color: dark ? "#D8E2F0" : COLORS.slate,
    face: FONT.body,
    role: "card body",
  });
}

async function addScreenshotCard(slide, slideNo, imagePath, left, top, width, height, label, fit = "contain") {
  addShape(slide, slideNo, "roundRect", left + 10, top + 14, width, height, "#0B18304D", COLORS.transparent, 0, "screenshot shadow");
  addShape(slide, slideNo, "roundRect", left, top, width, height, COLORS.white, "#CAD7E8", 1.1, "screenshot frame");
  addShape(slide, slideNo, "roundRect", left + 16, top + 14, width - 32, 26, "#EEF4FB", COLORS.transparent, 0, "browser bar");
  addShape(slide, slideNo, "ellipse", left + 28, top + 23, 8, 8, COLORS.coral, COLORS.transparent, 0, "browser dot");
  addShape(slide, slideNo, "ellipse", left + 42, top + 23, 8, 8, COLORS.gold, COLORS.transparent, 0, "browser dot");
  addShape(slide, slideNo, "ellipse", left + 56, top + 23, 8, 8, COLORS.success, COLORS.transparent, 0, "browser dot");
  await addImage(slide, slideNo, imagePath, left + 18, top + 52, width - 36, height - 70, fit, label);
  addPill(slide, slideNo, left + 18, top + height - 28, 120, label, COLORS.navy, COLORS.white, `${label} tag`);
}

function addStepCard(slide, slideNo, left, top, width, step, title, body, accentFill) {
  addShape(slide, slideNo, "roundRect", left, top, width, 152, COLORS.white, COLORS.line, 1.1, `${title} step`);
  addShape(slide, slideNo, "ellipse", left + 24, top + 24, 40, 40, accentFill, COLORS.transparent, 0, "step bubble");
  addText(slide, slideNo, String(step), left + 38, top + 35, 12, 12, {
    size: 12,
    color: COLORS.navy,
    face: FONT.mono,
    bold: true,
    align: "center",
    role: "step number",
  });
  addText(slide, slideNo, title, left + 82, top + 24, width - 102, 22, {
    size: 18,
    color: COLORS.ink,
    face: FONT.title,
    bold: true,
    role: "step title",
  });
  addText(slide, slideNo, body, left + 24, top + 78, width - 48, 46, {
    size: 15,
    color: COLORS.slate,
    face: FONT.body,
    role: "step body",
  });
}

function addComparisonRow(slide, slideNo, top, label, excelText, appText, alternate = false) {
  addShape(slide, slideNo, "roundRect", 92, top, 1096, 44, alternate ? "#F2F7FD" : COLORS.white, "#D7E3F2", 0.9, `${label} row`);
  addText(slide, slideNo, label, 114, top + 13, 170, 18, {
    size: 14,
    color: COLORS.ink,
    face: FONT.body,
    bold: true,
    role: "comparison label",
  });
  addText(slide, slideNo, excelText, 320, top + 7, 282, 30, {
    size: 12.5,
    color: COLORS.slate,
    face: FONT.body,
    role: "excel comparison",
  });
  addShape(slide, slideNo, "roundRect", 646, top + 6, 520, 32, COLORS.blueSoft, COLORS.transparent, 0, "app comparison highlight");
  addText(slide, slideNo, appText, 664, top + 8, 486, 28, {
    size: 12.5,
    color: COLORS.navy2,
    face: FONT.body,
    bold: true,
    role: "app comparison",
  });
}

function addFeatureCard(slide, slideNo, left, top, width, height, title, body, accentFill, badge) {
  addShape(slide, slideNo, "roundRect", left, top, width, height, COLORS.white, COLORS.line, 1.1, `${title} feature`);
  addShape(slide, slideNo, "roundRect", left + 18, top + 18, 56, 30, accentFill, COLORS.transparent, 0, "feature badge");
  addText(slide, slideNo, badge, left + 18, top + 26, 56, 12, {
    size: 11,
    color: COLORS.navy,
    face: FONT.mono,
    bold: true,
    align: "center",
    role: "feature badge text",
  });
  addText(slide, slideNo, title, left + 18, top + 66, width - 36, 24, {
    size: 18,
    color: COLORS.ink,
    face: FONT.title,
    bold: true,
    role: "feature title",
  });
  addText(slide, slideNo, body, left + 18, top + 102, width - 36, 54, {
    size: 15,
    color: COLORS.slate,
    face: FONT.body,
    role: "feature body",
  });
}

function addCallout(slide, slideNo, left, top, width, title, body, fill = COLORS.white) {
  addShape(slide, slideNo, "roundRect", left, top, width, 86, fill, "#D6E4F3", 1, `${title} callout`);
  addText(slide, slideNo, title, left + 16, top + 14, width - 32, 18, {
    size: 13,
    color: COLORS.blue,
    face: FONT.mono,
    bold: true,
    role: "callout title",
  });
  addText(slide, slideNo, body, left + 16, top + 36, width - 32, 34, {
    size: 14,
    color: COLORS.ink,
    face: FONT.body,
    role: "callout body",
  });
}

function addRoadmapCard(slide, slideNo, left, top, width, title, subtitle, items, accentFill) {
  addShape(slide, slideNo, "roundRect", left, top, width, 208, COLORS.white, COLORS.line, 1.1, `${title} roadmap`);
  addShape(slide, slideNo, "rect", left, top, width, 8, accentFill, COLORS.transparent, 0, "roadmap accent");
  addText(slide, slideNo, title, left + 20, top + 22, width - 40, 24, {
    size: 18,
    color: COLORS.ink,
    face: FONT.title,
    bold: true,
    role: "roadmap title",
  });
  addText(slide, slideNo, subtitle, left + 20, top + 50, width - 40, 18, {
    size: 12,
    color: COLORS.blue,
    face: FONT.mono,
    bold: true,
    role: "roadmap subtitle",
  });
  addBulletBlock(slide, slideNo, left + 20, top + 86, width - 40, items, false);
}

function addClosingBanner(slide, slideNo, text) {
  addShape(slide, slideNo, "roundRect", 70, 600, 1140, 66, "#11284B", "#294A73", 1.1, "closing banner");
  addText(slide, slideNo, text, 98, 621, 1084, 20, {
    size: 16,
    color: COLORS.white,
    face: FONT.body,
    bold: true,
    align: "center",
    role: "closing banner text",
  });
}

async function slide1(presentation) {
  const slideNo = 1;
  const slide = presentation.slides.add();
  addDarkBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Executive Brief", COLORS.teal);
  addPill(slide, slideNo, 70, 92, 230, "PATRIOT MEDIC | CHINA TRACKER", COLORS.tealSoft, COLORS.navy, "cover pill");
  addText(slide, slideNo, "Exercise Budget Planning\nWithout Excel Fragility", 70, 138, 540, 112, {
    size: 36,
    color: COLORS.white,
    face: FONT.title,
    bold: true,
    role: "cover title",
  });
  addText(slide, slideNo, "China Tracker turns unit inputs, rate tables, and reporting requirements into one live planning picture that leadership can trust.", 72, 270, 500, 68, {
    size: 18,
    color: "#D8E2F0",
    face: FONT.body,
    role: "cover subtitle",
  });
  addOutcomeCard(slide, slideNo, 70, 392, 488, "Why it matters now", "The application already replaces disconnected workbook logic with a single web-based planning surface that updates immediately.", COLORS.gold, "01", true);
  addPill(slide, slideNo, 70, 556, 150, "REAL-TIME TOTALS", COLORS.blueSoft, COLORS.navy);
  addPill(slide, slideNo, 232, 556, 154, "AUDIT-FRIENDLY", COLORS.tealSoft, COLORS.navy);
  addPill(slide, slideNo, 398, 556, 160, "EXPORT-READY", COLORS.goldSoft, COLORS.navy);
  await addScreenshotCard(slide, slideNo, SHOTS.dashboard, 650, 84, 560, 252, "Dashboard", "contain");
  await addScreenshotCard(slide, slideNo, SHOTS.unit, 620, 306, 360, 254, "Unit View", "contain");
  await addScreenshotCard(slide, slideNo, SHOTS.reports, 944, 344, 266, 182, "Reports", "contain");
  addSpeakerNotes(slide, slideNo);
}

async function slide2(presentation) {
  const slideNo = 2;
  const slide = presentation.slides.add();
  addLightBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "How The App Works");
  addTitle(slide, slideNo, "How the App Works", "The workflow mirrors how planners already think, but the calculations and rollups happen automatically.");

  const steps = [
    ["Create or select an exercise", "Set the exercise name, date range, and default duty day assumptions once at the top."],
    ["Configure rates and targets", "Adjust CPD, per diem, travel, meal, and budget target assumptions in one controlled location."],
    ["Build each unit page", "Enter PAX, locations, duty days, and detailed planning or execution inputs for each unit."],
    ["Review live rollups", "Dashboard, balance, and report views update automatically as soon as a planner changes data."],
    ["Export and refine", "Use reports, print/PDF, Excel export, refinements, clear tools, and undo to support the briefing cycle."],
  ];
  const accents = [COLORS.blueSoft, COLORS.tealSoft, COLORS.goldSoft, "#E6EEFF", "#E4FBF5"];
  for (let i = 0; i < steps.length; i += 1) {
    const row = i < 3 ? 0 : 1;
    const col = i < 3 ? i : i - 3;
    const width = i < 3 ? 352 : 544;
    const left = i < 3 ? 70 + i * 378 : 70 + col * 570;
    const top = row === 0 ? 296 : 468;
    addStepCard(slide, slideNo, left, top, width, i + 1, steps[i][0], steps[i][1], accents[i]);
  }
  addShape(slide, slideNo, "rightArrow", 420, 632, 430, 26, COLORS.blue, COLORS.transparent, 0, "workflow arrow");
  addText(slide, slideNo, "Structured input -> calculation engine -> leadership-ready output", 442, 636, 390, 14, {
    size: 11,
    color: COLORS.white,
    face: FONT.mono,
    bold: true,
    align: "center",
    role: "workflow caption",
  });
  addSpeakerNotes(slide, slideNo);
}

async function slide3(presentation) {
  const slideNo = 3;
  const slide = presentation.slides.add();
  addDarkBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Why It Beats Excel", COLORS.gold);
  addTitle(slide, slideNo, "Why It Is Better Than Using Excel", "Spreadsheet flexibility helps early on, but briefing-quality planning demands consistent logic, traceability, and faster scenario changes.", true);

  addPill(slide, slideNo, 70, 252, 150, "ONE DATA MODEL", COLORS.goldSoft, COLORS.navy, "comparison pillar");
  addPill(slide, slideNo, 236, 252, 162, "FASTER WHAT-IFS", COLORS.blueSoft, COLORS.navy, "comparison pillar");
  addPill(slide, slideNo, 414, 252, 188, "BRIEF-READY OUTPUT", COLORS.tealSoft, COLORS.navy, "comparison pillar");
  addPill(slide, slideNo, 618, 252, 176, "LOWER WORKBOOK RISK", COLORS.coralSoft, COLORS.navy, "comparison pillar");

  addShape(slide, slideNo, "roundRect", 70, 298, 1140, 332, "#11284B", "#294A73", 1.2, "comparison matrix");
  addText(slide, slideNo, "Planning Need", 114, 324, 170, 20, {
    size: 14,
    color: "#BFD1EA",
    face: FONT.mono,
    bold: true,
    role: "planning header",
  });
  addText(slide, slideNo, "Excel", 320, 324, 140, 20, {
    size: 14,
    color: "#BFD1EA",
    face: FONT.mono,
    bold: true,
    role: "excel header",
  });
  addText(slide, slideNo, "China Tracker", 884, 324, 180, 20, {
    size: 14,
    color: COLORS.white,
    face: FONT.mono,
    bold: true,
    role: "app header",
  });

  const rows = [
    ["Formula integrity", "Linked formulas\nacross tabs", "Structured inputs and\nshared calculation rules"],
    ["Speed to update", "Rework sheets and totals\nafter each change", "Totals and funding splits\nrecalculate immediately"],
    ["Scenario testing", "Duplicate versions\nto compare options", "Clear tools and 10-step undo\nsupport fast what-ifs"],
    ["Traceability", "Hard to brief where\nthe numbers came from", "Costs stay grouped by unit,\nsection, and funding line"],
    ["Briefing output", "Cleanup before\nevery review", "Balance report, print/PDF,\nand export from live data"],
  ];
  let top = 364;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    addComparisonRow(slide, slideNo, top, row[0], row[1], row[2], i % 2 === 1);
    top += 48;
  }
  addShape(slide, slideNo, "roundRect", 70, 646, 1140, 42, "#132C52", "#294A73", 1, "continuity banner");
  addText(slide, slideNo, "Planning stays less dependent on one spreadsheet owner because exercises, reports, and refinements are saved inside the same workflow.", 96, 659, 1088, 16, {
    size: 13,
    color: "#D8E2F0",
    face: FONT.body,
    align: "center",
    role: "continuity note",
  });
  addSpeakerNotes(slide, slideNo);
}

async function slide4(presentation) {
  const slideNo = 4;
  const slide = presentation.slides.add();
  addLightBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Main Features");
  addTitle(slide, slideNo, "Main Features", "The application combines executive visibility, detailed planning controls, and briefing output in one connected workflow.");

  const features = [
    ["Real-time rollups", "Grand total, RPA, O&M, and PAX update immediately as users change any planning input.", COLORS.blueSoft, "LIVE"],
    ["Unit-specific planning", "SG, AE, CAB, and A7 each have purpose-built sections for planning, players, white cell, and support logic.", COLORS.tealSoft, "UNIT"],
    ["Rate configuration", "CPD, per diem, meals, airfare, rental assumptions, and budget targets are maintained centrally.", COLORS.goldSoft, "RATE"],
    ["Reporting and export", "Balance, print/PDF, and Excel output make the same live data ready for briefings and follow-on documents.", "#E8EEFF", "RPT"],
    ["Refinements workspace", "Improvement notes, status tracking, and follow-up context live inside the app instead of in side notes.", "#E4FBF5", "NOTE"],
    ["Safety controls", "Section clear, unit clear, authenticated persistence, and 10-step undo reduce the risk of bad edits during preparation.", "#FFF2D9", "SAFE"],
  ];

  for (let i = 0; i < features.length; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    addFeatureCard(slide, slideNo, 70 + col * 378, 294 + row * 182, 352, 164, features[i][0], features[i][1], features[i][2], features[i][3]);
  }
  addSpeakerNotes(slide, slideNo);
}

async function slide5(presentation) {
  const slideNo = 5;
  const slide = presentation.slides.add();
  addLightBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Live Demonstration");
  addTitle(slide, slideNo, "Live Demonstration: Executive Dashboard", "Leadership can immediately see total cost, funding split, PAX, and unit-level impact from one screen.");

  await addScreenshotCard(slide, slideNo, SHOTS.dashboard, 420, 204, 790, 448, "Dashboard", "contain");
  addCallout(slide, slideNo, 70, 250, 300, "At-a-glance totals", "Grand Total, RPA, O&M, and PAX are visible immediately at the top of the screen.", COLORS.white);
  addCallout(slide, slideNo, 70, 354, 300, "Executive briefing table", "Unit-level totals summarize how SG, AE, CAB, and A7 each contribute to the overall cost picture.", COLORS.white);
  addCallout(slide, slideNo, 70, 458, 300, "Visual comparison", "Charts make the funding mix and cost distribution easier to explain in a live room.", COLORS.white);
  addCallout(slide, slideNo, 70, 562, 300, "Fast scenario review", "A planner can update assumptions and keep leadership oriented without leaving the application.", COLORS.white);
  addSpeakerNotes(slide, slideNo);
}

async function slide6(presentation) {
  const slideNo = 6;
  const slide = presentation.slides.add();
  addLightBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Live Demonstration");
  addTitle(slide, slideNo, "Live Demonstration: From Unit Entry to Reporting", "The same data drives detailed unit planning, report generation, and the refinements loop.");

  await addScreenshotCard(slide, slideNo, SHOTS.unit, 70, 250, 660, 394, "Unit Planning", "contain");
  await addScreenshotCard(slide, slideNo, SHOTS.reports, 770, 250, 440, 186, "Reports", "contain");
  await addScreenshotCard(slide, slideNo, SHOTS.refinements, 770, 458, 440, 186, "Refinements", "contain");

  addPill(slide, slideNo, 90, 612, 170, "ENTER COST DRIVERS", COLORS.blueSoft, COLORS.navy);
  addText(slide, slideNo, "Unit pages let users work at the level planners actually need: section totals, duty days, locations, contracts, and execution costs.", 272, 608, 430, 24, {
    size: 13,
    color: COLORS.slate,
    face: FONT.body,
    role: "unit caption",
  });
  addPill(slide, slideNo, 790, 612, 150, "BRIEF + FOLLOW UP", COLORS.tealSoft, COLORS.navy);
  addText(slide, slideNo, "Report output and refinements keep the briefing package and improvement tracking inside the same environment.", 952, 608, 236, 30, {
    size: 13,
    color: COLORS.slate,
    face: FONT.body,
    role: "reports caption",
  });
  addSpeakerNotes(slide, slideNo);
}

async function slide7(presentation) {
  const slideNo = 7;
  const slide = presentation.slides.add();
  addLightBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Future Potential");
  addTitle(slide, slideNo, "Future Potential Uses and Improvements", "The current version already replaces manual budgeting; the next phase can turn it into a broader planning platform.");

  addRoadmapCard(slide, slideNo, 70, 270, 350, "Near-term", "Improve the current operating loop", [
    "Role-based permissions and approval flow",
    "Saved report packs and leadership templates",
    "More guided setup for new exercises",
  ], COLORS.blue);
  addRoadmapCard(slide, slideNo, 465, 270, 350, "Next expansion", "Strengthen planning depth", [
    "Scenario versioning and side-by-side comparisons",
    "Exercise history and trend snapshots",
    "Portfolio view across multiple exercises",
  ], COLORS.teal);
  addRoadmapCard(slide, slideNo, 860, 270, 350, "Strategic potential", "Turn the tool into decision support", [
    "Forecasting for future budget posture",
    "Recommendation support for staffing or travel changes",
    "Cross-functional planning beyond a single briefing cycle",
  ], COLORS.gold);

  addShape(slide, slideNo, "roundRect", 70, 538, 1140, 110, COLORS.white, COLORS.line, 1.1, "use case strip");
  addText(slide, slideNo, "Potential future use cases", 96, 556, 220, 20, {
    size: 13,
    color: COLORS.blue,
    face: FONT.mono,
    bold: true,
    role: "use case label",
  });
  const pills = [
    ["Funding drills", COLORS.blueSoft],
    ["Scenario rehearsal", COLORS.tealSoft],
    ["After-action lessons", COLORS.goldSoft],
    ["Portfolio review", "#E8EEFF"],
    ["Decision support", "#E4FBF5"],
  ];
  let left = 290;
  for (const [label, fill] of pills) {
    const width = label.length * 8 + 38;
    addPill(slide, slideNo, left, 548, width, label, fill, COLORS.navy, "use case pill");
    left += width + 16;
  }
  addSpeakerNotes(slide, slideNo);
}

async function slide8(presentation) {
  const slideNo = 8;
  const slide = presentation.slides.add();
  addDarkBackdrop(slide, slideNo);
  addHeader(slide, slideNo, "Closing", COLORS.teal);
  addTitle(slide, slideNo, "What This Enables", "Faster planning cycles. Cleaner leadership briefings. More confidence in the numbers.", true);

  addOutcomeCard(slide, slideNo, 70, 280, 352, "Faster decisions", "Leaders can ask 'what if' questions and get an updated answer without a workbook rebuild.", COLORS.blueSoft, "01", true);
  addOutcomeCard(slide, slideNo, 464, 280, 352, "More defensible briefs", "Every total ties back to structured unit inputs, rate assumptions, and repeatable logic.", COLORS.tealSoft, "02", true);
  addOutcomeCard(slide, slideNo, 858, 280, 352, "Better continuity", "Refinements, exports, clear actions, and undo reduce rework across the full preparation cycle.", COLORS.goldSoft, "03", true);
  addClosingBanner(slide, slideNo, "Patriot Medic is already a stronger planning surface than a spreadsheet and is positioned to grow into a broader decision-support platform.");
  addSpeakerNotes(slide, slideNo);
}

async function createDeck() {
  await ensureDirs();
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  await slide1(presentation);
  await slide2(presentation);
  await slide3(presentation);
  await slide4(presentation);
  await slide5(presentation);
  await slide6(presentation);
  await slide7(presentation);
  await slide8(presentation);
  return presentation;
}

async function saveBlobToFile(blob, filePath) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await fs.writeFile(filePath, bytes);
}

async function writeInspect(presentation) {
  const lines = [
    JSON.stringify({ kind: "deck", slideCount: presentation.slides.count, slideSize: { width: W, height: H } }),
    ...presentation.slides.items.map((slide, index) => JSON.stringify({ kind: "slide", slide: index + 1, id: slide.id || `slide-${index + 1}` })),
    ...inspectRecords.map((recordItem) => JSON.stringify(recordItem)),
  ];
  await fs.writeFile(INSPECT_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function renderPreviews(presentation) {
  const previewPaths = [];
  for (let i = 0; i < presentation.slides.items.length; i += 1) {
    const previewBlob = await presentation.export({
      slide: presentation.slides.items[i],
      format: "png",
      scale: 1,
    });
    const previewPath = path.join(PREVIEW_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await saveBlobToFile(previewBlob, previewPath);
    previewPaths.push(previewPath);
  }
  await fs.writeFile(
    path.join(VERIFY_DIR, "render_summary.json"),
    JSON.stringify({ slideCount: presentation.slides.count, previewPaths }, null, 2),
    "utf8",
  );
}

async function exportDeck(presentation) {
  const intermediatePath = path.join(OUT_DIR, "tracker-presentation.pptx");
  const pptxBlob = await PresentationFile.exportPptx(presentation);
  await pptxBlob.save(intermediatePath);
  await fs.copyFile(intermediatePath, FINAL_PPTX);
  return intermediatePath;
}

const presentation = await createDeck();
await writeInspect(presentation);
await renderPreviews(presentation);
const exported = await exportDeck(presentation);
console.log(exported);
console.log(FINAL_PPTX);
