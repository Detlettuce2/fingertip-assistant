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
  catalogEntry: new Set(["id", "name", "description", "asset_token", "asset_kind", "quality", "star_count", "faction", "career", "rank", "category", "tags", "skills", "progression", "notes", "growth", "star_traces"]),
  catalogSkill: new Set(["name", "type", "description", "pets"]),
  catalogStage: new Set(["label", "description"]),
  heroGrowth: new Set(["initial_attributes","min_star","max_star","max_level"]),
  artifactGrowth: new Set(["max_level","stars"]),
  artifactStar: new Set(["star","attributes","all_attributes_percent"]),
  growth: new Set(["updated_on","attributes","hero_careers","hero_limits","artifact_qualities"]),
  careerGrowth: new Set(["name","levels","stages"]),
  qualityGrowth: new Set(["quality","levels"]),
  growthLevel: new Set(["level","materials","attributes"]),
  growthStage: new Set(["stage","level_limit","materials","attributes"]),
  heroLimit: new Set(["star","max_level","max_stage"]),
  resources: new Set(["updated_on","vip_levels","buildings","stationing_heroes","adventure","speed","cards","prosperity_percent_per_level","prosperity_max_level","quick","dungeons","gold","daily_gift","tasks","task_box","resources"]),
  resourceName: new Set(["id","name"]),
  resourceVip: new Set(["level","portal_gold_percent","portal_experience_percent","portal_storage_hours","quick_paid_count","gold_percent","dungeon_paid"]),
  resourceVipDungeon: new Set(["金币副本","经验副本"]),
  resourceBuilding: new Set(["name","skill","levels","stationed"]),
  resourceBuildingLevel: new Set(["level","per_hour","storage_hours"]),
  resourceStation: new Set(["name","percent","storage_percent"]),
  resourceStationingHero: new Set(["name","asset_token","buildings","skill_percent","production_percent","teammate_skill_bonus","storage_percent"]),
  resourceAdventure: new Set(["label","per_minute"]),
  resourceSpeed: new Set(["name","production_percent","quick_paid_count"]),
  resourceCard: new Set(["name","daily","production_percent","extra_gold_count","extra_equipment_count","claim_bonus"]),
  resourceQuick: new Set(["free_count","hours","paid_costs"]),
  resourceDungeon: new Set(["name","free_count","paid_count","paid_costs","levels"]),
  resourceDungeonLevel: new Set(["level","materials"]),
  resourceGold: new Set(["refresh_hours","free_count","paid_counts","paid_costs","levels"]),
  resourceGoldLevel: new Set(["level","counts"]),
  resourceTask: new Set(["name","materials","activity","quick_required"]),
  resourceTaskBox: new Set(["activity","materials"]),
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

test("available item artwork must not be left as an empty mapping", () => {
  const items = readJson(path.join(API_ROOT, "items.json")).items;
  for (const item of items) {
    if (item.asset_token || !item.icon_id) continue;
    const image = path.join(ROOT, "assets/item-assets", `icon_${item.icon_id}.png`);
    assert.equal(fs.existsSync(image), false, `${item.name} has artwork but no mapping`);
  }
  assert.equal(items.find(item => item.id === 150110638).asset_token, "icon_150110638");
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
      for (const skill of entry.skills) {
        assertKeys(skill, "catalogSkill", location + ".skills");
        if(kind === "seals") assert(Array.isArray(skill.pets) && skill.pets.every(name => data.pets.some(pet => pet.name === name)));
        else assert.equal(skill.pets,undefined);
      }
      if(kind === "heroes") {
        assertKeys(entry.growth,"heroGrowth",location+".growth");
        assert(Array.isArray(entry.star_traces));
        for(const trace of entry.star_traces)assertKeys(trace,"catalogStage",location+".star_traces");
      }
      else if(kind === "artifacts") {
        assertKeys(entry.growth,"artifactGrowth",location+".growth");
        for(const star of entry.growth.stars) assertKeys(star,"artifactStar",location+".growth.stars");
      } else assert.equal(entry.growth,undefined);
      for (const stage of entry.progression) assertKeys(stage, "catalogStage", location + ".progression");
      const strings = [entry.name, entry.description, entry.faction, entry.career, entry.rank, entry.category,
        ...entry.tags, ...entry.notes, ...entry.skills.flatMap(skill => [skill.name,skill.type,skill.description,...(skill.pets||[])]), ...entry.progression.flatMap(stage => Object.values(stage)), ...(entry.star_traces||[]).flatMap(stage=>[stage.label,stage.description])];
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

test("growth export uses display-only white lists and public material references",()=>{
  const data=readJson(path.join(API_ROOT,"growth.json"));
  assertKeys(data,"growth","growth");assert.deepEqual(data.attributes,["生命","攻击","物理防御","法术防御"]);
  const publicItems=new Set(readJson(path.join(API_ROOT,"items.json")).items.map(item=>item.id));
  function row(value,type){
    assertKeys(value,type,"growth row");assert.equal(value.attributes.length,4);
    assert(value.attributes.every(number=>Number.isSafeInteger(number)&&number>=0));
    for(const item of value.materials){assertKeys(item,"content","growth material");assert(publicItems.has(item.id));assert(Number.isSafeInteger(item.count)&&item.count>=0);}
  }
  assert.equal(data.hero_careers.length,4);
  for(const table of data.hero_careers){assertKeys(table,"careerGrowth","growth career");assert(["输出","术士","肉盾","辅助"].includes(table.name));assert.equal(table.levels.length,1500);table.levels.forEach(value=>row(value,"growthLevel"));table.stages.forEach(value=>row(value,"growthStage"));}
  assert.equal(data.artifact_qualities.length,3);
  for(const table of data.artifact_qualities){assertKeys(table,"qualityGrowth","growth quality");assert([4,5,6].includes(table.quality));assert.equal(table.levels.length,2000);table.levels.forEach(value=>row(value,"growthLevel"));}
  for(const value of data.hero_limits)assertKeys(value,"heroLimit","growth limit");
  assertNoPrivateData(data,"growth");
  assert(!/System\.register|chunks:\/\/|s2t3ar|l2o3ss|b2a3se_id|source_manifest|[A-Z]:[\\/]/.test(JSON.stringify(data)));
});

test("resource statistics expose only whitelisted display values and existing public item references", () => {
  const data = readJson(path.join(API_ROOT, "resources.json"));
  const items = new Map(readJson(path.join(API_ROOT, "items.json")).items.map(item => [item.id, item.name]));
  const heroes = new Set(readJson(path.join(API_ROOT, "catalogs.json")).heroes.map(hero => hero.name));
  const audit = (value, type) => assertKeys(value, type, `resources.${type}`);
  const material = values => values.forEach(value => {
    audit(value, "content");
    assert(items.has(value.id), `resource references unpublished item ${value.id}`);
    assert(Number.isFinite(value.count) && value.count >= 0, "resource amount must be a finite public number");
  });
  audit(data, "resources");
  assert.match(data.updated_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.vip_levels.length, 21);
  data.vip_levels.forEach((row, i) => {
    audit(row, "resourceVip"); audit(row.dungeon_paid, "resourceVipDungeon");
    assert.equal(row.level, i);
  });
  assert.equal(data.buildings.length, 9);
  assert.equal(data.stationing_heroes.length, 87);
  const buildingNames = new Set(data.buildings.map(building => building.name)), candidateNames = new Set();
  data.stationing_heroes.forEach(hero => {
    audit(hero, "resourceStationingHero"); assert(heroes.has(hero.name));
    assert(!candidateNames.has(hero.name)); candidateNames.add(hero.name);
    assert(hero.buildings.every(name => buildingNames.has(name)));
    assert.equal(new Set(hero.buildings).size, hero.buildings.length);
    assert(Number.isInteger(hero.skill_percent) && hero.skill_percent >= 0 && hero.skill_percent <= 20);
    assert(Number.isInteger(hero.production_percent) && Math.abs(hero.production_percent) <= 10);
    assert([0,1].includes(hero.teammate_skill_bonus));
    assert(Number.isFinite(hero.storage_percent) && hero.storage_percent >= 0 && hero.storage_percent <= 100);
    assert.match(hero.asset_token, /^[A-Za-z0-9_]+$/);
    assert(fs.existsSync(path.join(ROOT, 'assets/item-assets', hero.asset_token + '.png')));
  });
  const stationed = new Set();
  data.buildings.forEach(building => {
    audit(building, "resourceBuilding");
    building.levels.forEach((level, i) => {
      audit(level, "resourceBuildingLevel"); material(level.per_hour);
      assert.equal(level.level, i + 1); assert(level.storage_hours > 0);
    });
    assert.equal(building.stationed.length, 3);
    building.stationed.forEach(hero => {
      audit(hero, "resourceStation"); assert(heroes.has(hero.name));
      assert(!stationed.has(hero.name), "a public stationing preset cannot reuse a character");
      stationed.add(hero.name); assert(hero.percent >= 0 && hero.percent <= 25);
    });
  });
  assert.equal(data.adventure.length, 1485);
  data.adventure.forEach(stage => {audit(stage, "resourceAdventure"); material(stage.per_minute);});
  audit(data.speed, "resourceSpeed");
  data.cards.forEach(card => {
    audit(card, "resourceCard"); material(card.daily); if (card.claim_bonus) material(card.claim_bonus);
  });
  audit(data.quick, "resourceQuick");
  assert(data.quick.paid_costs.every(Number.isFinite));
  data.dungeons.forEach(dungeon => {
    audit(dungeon, "resourceDungeon");
    dungeon.levels.forEach((level, i) => {audit(level, "resourceDungeonLevel"); material(level.materials); assert.equal(level.level, i + 1);});
  });
  audit(data.gold, "resourceGold");
  assert.equal(data.gold.levels.length, 300);
  data.gold.levels.forEach((level, i) => {
    audit(level, "resourceGoldLevel"); assert.equal(level.level, i + 1);
    assert.equal(level.counts.length, 3); assert(level.counts.every(Number.isFinite));
  });
  material(data.daily_gift);
  data.tasks.forEach(task => {audit(task, "resourceTask"); material(task.materials);});
  audit(data.task_box, "resourceTaskBox"); material(data.task_box.materials);
  const resourceIds = new Set();
  data.resources.forEach(resource => {
    audit(resource, "resourceName"); assert.equal(resource.name, items.get(resource.id));
    assert(!resourceIds.has(resource.id)); resourceIds.add(resource.id);
  });
  assertNoPrivateData(data, "api/resources.json");
  assert(!/b2a3se_id|p2o3ol_id|sl_passive|bulid_id|g2u3ard_id|hero_star|l2a3ng_id|_cfg|chunks:\/\//.test(JSON.stringify(data)), "resource data contains original source fields");
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
