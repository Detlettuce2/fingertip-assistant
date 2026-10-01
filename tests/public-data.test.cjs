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
  catalogs: new Set(["updated_on", "heroes", "runes", "pets", "artifacts", "seals"]),
  catalogEntry: new Set(["id", "name", "description", "asset_token", "asset_kind", "quality", "star_count", "faction", "career", "rank", "category", "tags", "skills", "progression", "notes"]),
  catalogSkill: new Set(["name", "type", "description"]),
  catalogStage: new Set(["label", "description"]),
  rotationData: new Set(["channel", "updated_at_china", "rotations", "groups"]),
  rotation: new Set(["slot", "label", "ids", "names"]),
  serverGroup: new Set([
    "start_sid", "end_sid", "status", "source", "calendar_open_time", "open_days",
    "rotation_started_at", "next_switch_at", "display_start", "display_end",
    "display_start_number", "display_end_number", "current", "next",
  ]),
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

test("catalogs contain only public display fields, plain text, and existing images", () => {
  const data = readJson(path.join(API_ROOT, "catalogs.json"));
  assertKeys(data, "catalogs", "api/catalogs.json");
  assert.match(data.updated_on, /^\d{4}-\d{2}-\d{2}$/);
  const counts = {heroes: 87, runes: 60, pets: 16, artifacts: 43, seals: 7};
  const publicItems = new Map(readJson(path.join(API_ROOT, "items.json")).items.map(item => [item.id, item]));
  const newPublicItems = new Map([[150110638, "守护圣盾"], [150110639, "霜结冰花"]]);
  for (const [kind, count] of Object.entries(counts)) {
    const ids = new Set();
    assert.equal(data[kind].length, count, `${kind} catalog must not silently lose entries`);
    for (const entry of data[kind]) {
      const location = `catalogs.${kind}.${entry.id}`;
      assertKeys(entry, "catalogEntry", location);
      assert(!ids.has(entry.id), `${location} duplicates a public item`); ids.add(entry.id);
      assert(Number.isSafeInteger(entry.id) && entry.id > 0);
      assert(publicItems.has(entry.id) || newPublicItems.get(entry.id) === entry.name, `${location} is not a public item reference`);
      if (kind === "heroes") assert.equal(publicItems.get(entry.id).asset_kind, "hero");
      assert(entry.name && entry.description, `${location} must have display text`);
      assert(entry.quality >= 1 && entry.quality <= 8);
      assert(["hero", "rune", "pet", "item"].includes(entry.asset_kind));
      if (entry.asset_token) {
        assert.match(entry.asset_token, /^[A-Za-z0-9_]+$/);
        assert(fs.existsSync(path.join(ROOT, "assets/item-assets", entry.asset_token + ".png")), `${location} has a missing image`);
      }
      for (const skill of entry.skills) assertKeys(skill, "catalogSkill", location + ".skills");
      for (const stage of entry.progression) assertKeys(stage, "catalogStage", location + ".progression");
      const strings = [entry.name, entry.description, entry.faction, entry.career, entry.rank, entry.category,
        ...entry.tags, ...entry.notes, ...entry.skills.flatMap(skill => Object.values(skill)), ...entry.progression.flatMap(stage => Object.values(stage))];
      for (const value of strings) {
        assert.equal(typeof value, "string");
        assert(!/<[^>]+>/.test(value), `${location} contains client rich text`);
        assert(!/(?:https?:\/\/|chunks:\/\/|(?:eff|res|assets)\/|\.ts\b|(?:Config|modules|完整脚本)[\\/]|[A-Z]:[\\/])/i.test(value), `${location} contains a resource or source path`);
      }
      assertNoPrivateData(entry, location);
    }
  }
  const hiddenRunes = new Set([90110209, 90110213, 90110218, 90110301, 90110310, 90110403, 90110415, 90110417]);
  assert.equal(data.runes.filter(entry => hiddenRunes.has(entry.id)).length, 0, "hidden runes must not be exported");
  assert.equal(data.heroes.filter(entry => ["主角", "福袋"].includes(entry.name)).length, 0, "internal encounter units must not be exported");
});

test("production files do not include client modules, raw configuration tables, or game-server collectors", () => {
  for (const entry of fs.readdirSync(ROOT, {withFileTypes: true})) {
    if (!entry.isFile() || !/\.(js|html)$/.test(entry.name)) continue;
    const source = fs.readFileSync(path.join(ROOT, entry.name), "utf8");
    assert(!/System\.register\(|chunks:\/\/|_RF\.push\(|original_encrypted_source|bcsgproto|source_manifest\.json/.test(source), `${entry.name} contains client code or source metadata`);
    assert(!/fetch\(\s*["'`]https?:\/\/|wss?:\/\//.test(source), `${entry.name} accesses an external game service`);
  }
  for (const file of jsonFiles(API_ROOT)) assert(!/_cfg\.json$|bcsgproto|source_manifest|module_index/.test(path.basename(file)), `${file} is an internal table or source index`);
});

test("public server data contains a complete rotation table and approved fields", () => {
  for (const file of jsonFiles(path.join(API_ROOT, "data"))) {
    const data = readJson(file);
    const location = path.relative(ROOT, file);
    assertKeys(data, "rotationData", location);
    assert.equal(data.rotations.length, 15, `${location} must contain all 15 rotation slots`);
    assert.deepEqual(data.rotations.map(rotation => rotation.slot), Array.from({length: 15}, (_, index) => index + 1));
    data.rotations.forEach((rotation, index) => assertKeys(rotation, "rotation", `${location}.rotations[${index}]`));
    data.groups.forEach((group, index) => assertKeys(group, "serverGroup", `${location}.groups[${index}]`));
    assertNoPrivateData(data, location);
  }
});
