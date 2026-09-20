const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const API_ROOT = path.join(ROOT, "api");

const ALLOWED_KEYS = {
  holyland: new Set(["channel", "season", "realm", "captured_at_china", "rounds", "bronze_match"]),
  round: new Set(["key", "label", "matches"]),
  match: new Set(["players", "lineup_id"]),
  player: new Set(["server_id", "name", "avatar_id", "frame_id", "result"]),
  lineup: new Set(["round_end", "round_max", "captured_at_china", "sides"]),
  side: new Set(["server_id", "name", "on_field", "assists", "pets"]),
  unit: new Set([
    "name", "level", "star", "stand", "asset_token", "quality",
    "star_mark_sprite", "star_mark_tier", "realm", "strength",
  ]),
  items: new Set(["items"]),
  item: new Set([
    "id", "name", "description", "class_id", "subclass_id", "choice_badge",
    "special_badge", "rarity", "icon_id", "asset_token", "asset_kind",
    "star_count", "quality", "frame", "hero_strength", "hero_realm",
    "is_fragment", "show_fragment_badge", "is_hero_heart", "contents",
  ]),
  content: new Set(["id", "count"]),
};

const FORBIDDEN_KEY = /(^|_)(record|player|base|battle|map|group|replay|capture|file|path|cookie|password|secret|hp|health)(_|$)/i;
const PUBLIC_EXCEPTIONS = new Set(["captured_at_china"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function jsonFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(target);
    return entry.name.endsWith(".json") ? [target] : [];
  });
}

function assertKeys(value, type, location) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${location} must be an object`);
  for (const key of Object.keys(value)) {
    assert(ALLOWED_KEYS[type].has(key), `${location} exposes unexpected ${type} key: ${key}`);
  }
}

function assertNoPrivateData(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPrivateData(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      assert(!/^[A-Za-z]:[\\/]/.test(value), `${location} exposes a local path`);
      assert(!value.includes("\\battle_capture\\"), `${location} exposes a capture path`);
      assert(!/\.jsonl?$/i.test(value), `${location} exposes a replay filename`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assert(!FORBIDDEN_KEY.test(key) || PUBLIC_EXCEPTIONS.has(key), `${location} exposes private-looking key: ${key}`);
    assertNoPrivateData(entry, `${location}.${key}`);
  }
}

function auditMatch(match, location, lineupIds) {
  assertKeys(match, "match", location);
  (match.players || []).forEach((player, index) => assertKeys(player, "player", `${location}.players[${index}]`));
  if (match.lineup_id) {
    assert.match(match.lineup_id, /^[0-9a-f]{16}$/, `${location} has a non-opaque lineup id`);
    lineupIds.add(match.lineup_id);
  }
}

test("public Holyland and lineup exports expose only approved fields", () => {
  const lineupIds = new Set();
  const holylandFiles = jsonFiles(path.join(API_ROOT, "holyland"));

  for (const file of holylandFiles) {
    const data = readJson(file);
    const location = path.relative(ROOT, file);
    assertKeys(data, "holyland", location);
    (data.rounds || []).forEach((round, roundIndex) => {
      assertKeys(round, "round", `${location}.rounds[${roundIndex}]`);
      (round.matches || []).forEach((match, matchIndex) =>
        auditMatch(match, `${location}.rounds[${roundIndex}].matches[${matchIndex}]`, lineupIds));
    });
    if (data.bronze_match) auditMatch(data.bronze_match, `${location}.bronze_match`, lineupIds);
    assertNoPrivateData(data, location);
  }

  const lineupDirectory = path.join(API_ROOT, "lineups");
  const lineupFiles = jsonFiles(lineupDirectory);
  const exportedIds = new Set();
  for (const file of lineupFiles) {
    const id = path.basename(file, ".json");
    const data = readJson(file);
    const location = path.relative(ROOT, file);
    assert.match(id, /^[0-9a-f]{16}$/, `${location} must use an opaque filename`);
    exportedIds.add(id);
    assertKeys(data, "lineup", location);
    (data.sides || []).forEach((side, sideIndex) => {
      assertKeys(side, "side", `${location}.sides[${sideIndex}]`);
      for (const bucket of ["on_field", "assists", "pets"]) {
        (side[bucket] || []).forEach((unit, unitIndex) =>
          assertKeys(unit, "unit", `${location}.sides[${sideIndex}].${bucket}[${unitIndex}]`));
      }
    });
    assertNoPrivateData(data, location);
  }

  assert.deepEqual(exportedIds, lineupIds, "every public lineup reference must have exactly one exported file");
});

test("public encyclopedia export exposes only approved fields", () => {
  const file = path.join(API_ROOT, "items.json");
  const data = readJson(file);
  assertKeys(data, "items", "api/items.json");
  for (const [index, item] of (data.items || []).entries()) {
    assertKeys(item, "item", `api/items.json.items[${index}]`);
    (item.contents || []).forEach((content, contentIndex) =>
      assertKeys(content, "content", `api/items.json.items[${index}].contents[${contentIndex}]`));
  }
  assertNoPrivateData(data, "api/items.json");
});
