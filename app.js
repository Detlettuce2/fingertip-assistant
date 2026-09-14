const CHANNELS = {
  xkbeta: {label: "指尖/指尖像素", available: true},
  xkapp: {label: "像素", available: true},
  xkstorebeta: {label: "浮空岛", available: true},
  xkgdt: {label: "奥术殿", available: true},
  xkhw: {label: "熔火城", available: true},
  xkghb: {label: "深境", available: true},
  xkgha: {label: "露娜", available: true},
};

const HOLYLAND_CHANNELS = {
  xkbeta: {label: "指尖/指尖像素", realms: [1, 2, 3, 4, 5, 6, 7, 8]},
  xkgdt: {label: "奥术殿", realms: [1, 2]},
};
const HOLYLAND_SEASONS = {
  S14: {label: "S14"},
};

const urlParams = new URLSearchParams(location.search);
const storedChannel = localStorage.getItem("voidRotationChannel");
const initialChannel = urlParams.get("channel") || storedChannel || "xkbeta";
const storedDescending = localStorage.getItem("voidRotationDescending");
const requestedView = urlParams.get("view") || localStorage.getItem("assistantView") || "server";
const initialView = ["global", "server", "encyclopedia"].includes(requestedView) ? requestedView : "server";
const storedGlobalView = localStorage.getItem("globalCalendarView");

const state = {
  data: null,
  holyland: null,
  holylandSeason: localStorage.getItem("holylandSeason") || "S14",
  holylandChannel: localStorage.getItem("holylandChannel") || "xkbeta",
  holylandRealm: localStorage.getItem("holylandRealm") || "1",
  holylandLoading: false,
  items: null,
  itemsLoading: false,
  itemClass: "all",
  itemQuery: "",
  itemPage: 1,
  itemPageSize: 6,
  selectedItemId: null,
  channel: CHANNELS[initialChannel] ? initialChannel : "xkbeta",
  selectedSid: Number(urlParams.get("sid")) || Number(localStorage.getItem("voidRotationSid")) || 2014,
  descending: storedDescending === "true",
  secondsToRefresh: 0,
  boundaryRefreshAt: null,
  loading: false,
  view: initialView,
  globalView: ["activities", "holyland"].includes(storedGlobalView) ? storedGlobalView : "activities",
};

const els = {
  clock: document.querySelector("#clock"),
  search: document.querySelector("#server-search"),
  searchButton: document.querySelector("#search-button"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshState: document.querySelector("#refresh-state"),
  selected: document.querySelector("#selected-card"),
  rows: document.querySelector("#group-rows"),
  summary: document.querySelector("#data-summary"),
  sortButton: document.querySelector("#sort-button"),
  channelSelect: document.querySelector("#channel-select"),
  navigationTabs: [...document.querySelectorAll(".navigation-tab")],
  globalView: document.querySelector("#global-calendar-view"),
  serverView: document.querySelector("#server-calendar-view"),
  encyclopediaView: document.querySelector("#encyclopedia-view"),
  holylandRealm: document.querySelector("#holyland-realm"),
  holylandSeason: document.querySelector("#holyland-season"),
  holylandChannel: document.querySelector("#holyland-channel"),
  holylandSummary: document.querySelector("#holyland-summary"),
  holylandResultLabel: document.querySelector("#holyland-result-label"),
  holylandBracket: document.querySelector("#holyland-bracket"),
  globalTabs: [...document.querySelectorAll(".secondary-navigation-tab")],
  activityPanel: document.querySelector("#activity-calendar-panel"),
  holylandPanel: document.querySelector("#holyland-review-panel"),
  activityCalendar: document.querySelector("#activity-calendar"),
  itemSearch: document.querySelector("#item-search"),
  itemClassFilter: document.querySelector("#item-class-filter"),
  itemSummary: document.querySelector("#item-summary"),
  itemGrid: document.querySelector("#item-grid"),
  itemDetail: document.querySelector("#item-detail"),
  itemPrev: document.querySelector("#item-prev"),
  itemNext: document.querySelector("#item-next"),
  itemPageSummary: document.querySelector("#item-page-summary"),
};

const ACTIVITY_CARDS = [
  {key: "syzf", name: "圣域争锋", group: "圣域赛季", title: true, icon: true, schedule: "holyland", tone: "sky"},
  {key: "ygwz", name: "耀光王座", group: "竞技玩法", title: true, icon: true, schedule: "throne", tone: "violet"},
  {key: "yjtt", name: "异界天梯", group: "竞技玩法", title: true, icon: true, schedule: "ladder", tone: "pink"},
  {key: "jjdj", name: "极境对决", group: "竞技玩法", title: true, icon: true, schedule: "duel", tone: "rose"},
  {key: "yjzy", name: "永劫战域", group: "竞技玩法", title: true, icon: true, schedule: "eternal", tone: "orange"},
  {key: "myzc", name: "魔域战场", group: "跨服玩法", icon: true, schedule: "demon", tone: "indigo"},
];

const ROTATION_WEEK_CARDS = [
  {key: "sldd", name: "失落之地", group: "轮换活动", icon: true, tone: "amber"},
  {key: "yyhx", name: "远洋航行", group: "轮换活动", tone: "ocean"},
  {key: "yzjj", name: "奕阵竞技", group: "轮换活动", icon: true, tone: "teal"},
];
const NEW_VOID_CARD = {key: "newvoid", name: "新虚空", group: "新虚空卡池", tone: "sky"};

function setGlobalView(view) {
  state.globalView = view === "holyland" ? "holyland" : "activities";
  localStorage.setItem("globalCalendarView", state.globalView);
  els.activityPanel.hidden = state.globalView !== "activities";
  els.holylandPanel.hidden = state.globalView !== "holyland";
  els.globalTabs.forEach(tab => {
    const active = tab.dataset.globalView === state.globalView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (state.globalView === "activities") renderActivityCalendar();
  if (state.globalView === "holyland" && !state.holyland) loadHolyland();
  else if (state.globalView === "holyland") requestAnimationFrame(drawBracketConnectors);
}

function setView(view, updateHistory = true) {
  state.view = ["global", "server", "encyclopedia"].includes(view) ? view : "server";
  localStorage.setItem("assistantView", state.view);
  els.globalView.hidden = state.view !== "global";
  els.serverView.hidden = state.view !== "server";
  els.encyclopediaView.hidden = state.view !== "encyclopedia";
  els.navigationTabs.forEach(tab => {
    const active = tab.dataset.view === state.view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  const viewTitles = {global: "全服日历", server: "区服日历", encyclopedia: "指尖百科"};
  document.title = `指尖小助手 · ${viewTitles[state.view]}`;
  if (updateHistory) {
    const url = new URL(location.href);
    if (state.view === "server") url.searchParams.delete("view");
    else url.searchParams.set("view", state.view);
    history.replaceState(null, "", url);
  }
  if (state.view === "server" && !state.data) loadData();
  if (state.view === "global") setGlobalView(state.globalView);
  if (state.view === "encyclopedia" && !state.items) loadItems();
  else if (state.view === "encyclopedia") scheduleItemPageSize();
}

function activeChannel() {
  return CHANNELS[state.channel];
}

function populateHolylandRealms() {
  const config = HOLYLAND_CHANNELS[state.holylandChannel] || HOLYLAND_CHANNELS.xkbeta;
  state.holylandChannel = HOLYLAND_CHANNELS[state.holylandChannel] ? state.holylandChannel : "xkbeta";
  const realms = config.realms.map(String);
  if (!realms.includes(state.holylandRealm)) state.holylandRealm = realms[0];
  els.holylandRealm.innerHTML = realms.map(realm => `<option value="${realm}">${realm}区</option>`).join("");
  els.holylandRealm.value = state.holylandRealm;
  localStorage.setItem("holylandRealm", state.holylandRealm);
}

function populateHolylandSeasons() {
  const seasons = Object.entries(HOLYLAND_SEASONS);
  if (!HOLYLAND_SEASONS[state.holylandSeason]) state.holylandSeason = seasons[0]?.[0] || "S14";
  els.holylandSeason.innerHTML = seasons.map(([value, season]) => `<option value="${value}">${escapeHtml(season.label)}</option>`).join("");
  els.holylandSeason.value = state.holylandSeason;
  localStorage.setItem("holylandSeason", state.holylandSeason);
}

function beijingNow() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date()).replaceAll("/", "-");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function beijingDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * HOUR);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * HOUR;
}

function beijingWeekStart(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * HOUR);
  const mondayOffset = (shifted.getUTCDay() + 6) % 7;
  return beijingDayStart(now) - mondayOffset * DAY;
}

function timedStage(label, start, end, detail = "") {
  const now = Date.now();
  return {label, detail, start, end, ratio: Math.min(1, Math.max(0, (now - start) / (end - start)))};
}

function activityStatus(type) {
  const now = Date.now();
  const dayStart = beijingDayStart();
  const weekStart = beijingWeekStart();
  if (type === "throne") {
    const starts = [
      weekStart + DAY + 21 * HOUR,
      weekStart + 3 * DAY + 21 * HOUR,
      weekStart + 5 * DAY + 21 * HOUR,
      weekStart + 8 * DAY + 21 * HOUR,
    ];
    const battleDuration = 24 * 60 * 1000;
    const activeStart = starts.find(start => now >= start && now < start + battleDuration);
    if (activeStart !== undefined) {
      const stage = timedStage("战斗中", activeStart, activeStart + battleDuration);
      stage.countdownPrefix = "本期战斗结束还有 ";
      return stage;
    }
    const nextStart = starts.find(start => start > now) || starts[starts.length - 1];
    const previousStart = [...starts].reverse().find(start => start + battleDuration <= now) || weekStart - 2 * DAY + 21 * HOUR;
    const stage = timedStage("等待中", previousStart + battleDuration, nextStart, "每周二、四、六 21:00");
    stage.countdownPrefix = "下次开赛还有 ";
    return stage;
  }
  if (type === "ladder") {
    const seasonOpen = weekStart + 8 * HOUR;
    const seasonClose = weekStart + 6 * DAY + 21 * HOUR;
    const todayOpen = dayStart + 8 * HOUR;
    const todayClose = dayStart + 21 * HOUR;
    let stage;
    if (now < todayOpen) stage = timedStage("休赛期", dayStart - 3 * HOUR, todayOpen, "08:00 恢复挑战");
    else if (now < todayClose) stage = timedStage("今日挑战中", todayOpen, todayClose, "21:00 日榜结算");
    else stage = timedStage("休赛期", todayClose, dayStart + DAY + 8 * HOUR, "明日 08:00 恢复挑战");
    stage.weeklyProgress = Math.min(1, Math.max(0, (now - seasonOpen) / (seasonClose - seasonOpen)));
    stage.dailyProgress = {
      label: stage.label === "今日挑战中" ? "今日挑战" : "休赛阶段",
      ratio: stage.ratio,
    };
    return stage;
  }
  if (type === "duel") {
    const challengeStart = weekStart + 8 * HOUR;
    const challengeEnd = weekStart + 5 * DAY;
    const registrationStart = weekStart - 2 * DAY;
    if (now < challengeStart) return timedStage("报名阶段", registrationStart, challengeStart, "周一 08:00 开始挑战");
    if (now < challengeEnd) return timedStage("战斗阶段", challengeStart, challengeEnd, "周五 24:00 结算");
    return timedStage("报名阶段", challengeEnd, weekStart + 7 * DAY + 8 * HOUR, "下周一 08:00 开始战斗");
  }
  if (type === "eternal") {
    const open = weekStart + 8 * HOUR;
    const close = weekStart + 6 * DAY + 22 * HOUR;
    if (now < open) {
      const stage = timedStage("准备阶段", weekStart - 2 * HOUR, open, "08:00 开启新赛季");
      stage.countdownPrefix = "距离开赛还有 ";
      return stage;
    }
    if (now < close) {
      const stage = timedStage("战斗阶段", open, close, "周日 22:00 最终结算");
      stage.countdownPrefix = "距离本周结算还有 ";
      return stage;
    }
    const stage = timedStage("准备阶段", close, weekStart + 7 * DAY + 8 * HOUR, "下周一 08:00 开启新赛季");
    stage.countdownPrefix = "距离开赛还有 ";
    return stage;
  }
  if (type === "demon") {
    const weeklyOpen = weekStart + DAY + 8 * HOUR;
    const weeklyClose = weekStart + 6 * DAY + 21 * HOUR;
    if (now < weeklyOpen) {
      const stage = timedStage("匹配中", weekStart - 3 * HOUR, weeklyOpen);
      stage.countdownPrefix = "距离本周开启还有 ";
      return stage;
    }
    if (now >= weeklyClose) {
      const nextOpen = weekStart + 8 * DAY + 8 * HOUR;
      const stage = timedStage("匹配中", weeklyClose, nextOpen);
      stage.countdownPrefix = "距离下周开启还有 ";
      return stage;
    }

    const prepareOpen = dayStart + 8 * HOUR;
    const battleOpen = dayStart + 20 * HOUR;
    const restOpen = dayStart + 21 * HOUR;
    let stage;
    if (now < prepareOpen) stage = timedStage("休整阶段", dayStart - 3 * HOUR, prepareOpen);
    else if (now < battleOpen) stage = timedStage("备战阶段", prepareOpen, battleOpen);
    else if (now < restOpen) stage = timedStage("战斗阶段", battleOpen, restOpen);
    else stage = timedStage("休整阶段", restOpen, dayStart + DAY + 8 * HOUR);
    stage.weeklyProgress = Math.min(1, Math.max(0, (now - weeklyOpen) / (weeklyClose - weeklyOpen)));
    stage.dailyProgress = {label: stage.label.replace("阶段", ""), ratio: stage.ratio};
    return stage;
  }
  if (type === "holyland") {
    const anchor = Date.parse("2026-09-07T08:00:00+08:00");
    const cycle = 28 * DAY;
    const cycleStart = anchor + Math.floor((now - anchor) / cycle) * cycle;
    const cycleEnd = cycleStart + cycle;
    const week = Math.min(4, Math.floor((now - cycleStart) / (7 * DAY)) + 1);
    const weekStart = cycleStart + (week - 1) * 7 * DAY;
    const prelimStart = cycleStart + 26 * DAY + 4 * HOUR;
    const prelimEnd = prelimStart + HOUR;
    const finalStart = cycleStart + 27 * DAY + 3 * HOUR;
    const finalEnd = finalStart + 160 * 60 * 1000;
    let stage;
    if (now < prelimStart) {
      stage = timedStage("等待中", cycleStart, prelimStart);
      stage.countdownPrefix = "距离预赛还有 ";
    } else if (now < prelimEnd) {
      stage = timedStage("预赛战斗中", prelimStart, prelimEnd);
      stage.countdownPrefix = "距离预赛结束还有 ";
    } else if (now < finalStart) {
      stage = timedStage("等待中", prelimEnd, finalStart);
      stage.countdownPrefix = "距离决赛还有 ";
    } else if (now < finalEnd) {
      stage = timedStage("决赛战斗中", finalStart, finalEnd);
      stage.countdownPrefix = "距离决赛结束还有 ";
    } else {
      stage = timedStage("赛季已结束", finalEnd, cycleEnd);
      stage.noDetail = true;
    }
    stage.weeklyProgress = (now - cycleStart) / cycle;
    stage.secondaryProgress = {label: `第${week}周`, ratio: (now - weekStart) / (7 * DAY)};
    stage.note = `战令积分上限：${[1500, 3000, 4500, 6000][week - 1]}`;
    return stage;
  }
  if (type === "rotation") return {label: "轮换顺序已知", detail: "失落之地 → 远洋航行 → 奕阵竞技", unknown: true};
  return {label: "排期尚待接入", detail: "需要从服务器活动时间校准", unknown: true};
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function formatBeijingMonthDay(timestamp) {
  const shifted = new Date(timestamp + 8 * HOUR);
  return `${shifted.getUTCFullYear()}年${shifted.getUTCMonth() + 1}月${shifted.getUTCDate()}日 ${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

function rotationCardForWeek(weekIndex) {
  if (positiveModulo(weekIndex, 2) === 0) return NEW_VOID_CARD;
  const activityIndex = positiveModulo(Math.floor((weekIndex - 1) / 2), ROTATION_WEEK_CARDS.length);
  return ROTATION_WEEK_CARDS[activityIndex];
}

function rotationWeekInfo() {
  const anchor = Date.parse("2026-09-10T08:00:00+08:00");
  const now = Date.now();
  const weekIndex = Math.floor((now - anchor) / (7 * DAY));
  const start = anchor + weekIndex * 7 * DAY;
  const end = start + 7 * DAY;
  const currentCard = rotationCardForWeek(weekIndex);
  const nextCard = rotationCardForWeek(weekIndex + 1);
  const status = timedStage(currentCard === NEW_VOID_CARD ? "新虚空进行中" : "活动进行中", start, end);
  status.countdownPrefix = "距离下周切换还有 ";
  status.weeklyProgress = status.ratio;
  if (currentCard !== NEW_VOID_CARD) {
    const dayStart = beijingDayStart();
    const dailyOpen = dayStart + 8 * HOUR;
    const dailyClose = dayStart + DAY;
    if (now < dailyOpen) status.dailyProgress = {label: "休整中", ratio: (now - dayStart) / (8 * HOUR)};
    else status.dailyProgress = {label: "活动中", ratio: (now - dailyOpen) / (dailyClose - dailyOpen)};
  }
  return {
    currentCard,
    currentStatus: status,
    nextCard,
    nextStatus: {label: "即将开启", detail: `${formatBeijingMonthDay(end)} 开始`, noProgress: true},
  };
}

function activityCard(card, suppliedStatus = null, extraClass = "") {
  const status = suppliedStatus || activityStatus(card.schedule);
  const defaultRemaining = status.noDetail ? "" : (status.end ? formatRemaining(status.end - Date.now()) : status.detail);
  const remaining = status.countdownPrefix
    ? `${status.countdownPrefix}${defaultRemaining.replace(/^剩余\s*/, "")}`
    : defaultRemaining;
  const title = card.title
    ? `<img class="activity-title-sprite" src="assets/events/${card.key}-title.png" alt="${escapeHtml(card.name)}">`
    : `<strong class="activity-title-text">${escapeHtml(card.name)}</strong>`;
  const icon = card.icon ? `<img class="activity-mark" src="assets/events/${card.key}-icon.png" alt="">` : `<span class="activity-mark activity-mark-text">${escapeHtml(card.name.slice(0, 1))}</span>`;
  const mainRatio = status.weeklyProgress ?? status.ratio;
  const progressMarkup = status.noProgress ? "" : (status.unknown
      ? `<div class="activity-progress unavailable" aria-hidden="true"><span></span></div>`
      : `<div class="activity-progress" role="progressbar" aria-label="${escapeHtml(card.name)}周进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(mainRatio * 100)}"><span style="width:${mainRatio * 100}%"></span></div>`);
  const secondaryProgress = status.secondaryProgress || status.dailyProgress;
  const dailyMarkup = secondaryProgress
    ? `<div class="activity-daily-progress"><b>${escapeHtml(secondaryProgress.label)}</b><span><i style="width:${Math.min(1, Math.max(0, secondaryProgress.ratio)) * 100}%"></i></span></div>`
    : "";
  return `<article class="activity-card tone-${card.tone}${secondaryProgress ? " has-daily-progress" : ""}${extraClass ? ` ${extraClass}` : ""}">
    <div class="activity-art" aria-hidden="true">${icon}</div>
    <div class="activity-card-copy">
      <span class="activity-kind">${escapeHtml(card.group)}</span>
      ${title}
      <div class="activity-stage"><strong>${escapeHtml(status.label)}</strong>${remaining ? `<span>${escapeHtml(remaining)}</span>` : ""}</div>
      ${status.note ? `<div class="activity-note">${escapeHtml(status.note)}</div>` : ""}
      ${dailyMarkup}
    </div>
    ${progressMarkup}
  </article>`;
}

function renderActivityCalendar() {
  if (!els.activityCalendar) return;
  const rotation = rotationWeekInfo();
  els.activityCalendar.innerHTML = `<section class="activity-group">
    <h3>赛季与竞技</h3>
    <div class="activity-grid">${ACTIVITY_CARDS.map(card => activityCard(card)).join("")}</div>
  </section>
  <section class="activity-group">
    <h3>虚空与活动轮换</h3>
    <div class="activity-grid"><div class="rotation-week-pair">
      ${activityCard(rotation.currentCard, rotation.currentStatus, "rotation-current")}
      ${activityCard(rotation.nextCard, rotation.nextStatus, "rotation-next")}
    </div></div>
  </section>`;
}

// Game descriptions use tags such as <color=#63974c>...</color>. Escape the
// full source first, then restore only the tightly-validated color tags so
// description data cannot inject arbitrary HTML or CSS.
function renderItemDescription(value) {
  const escaped = escapeHtml(value ?? "");
  return escaped.replace(/&lt;color=(#[0-9a-fA-F]{3,8})&gt;([\s\S]*?)&lt;\/color&gt;/g,
    (_match, color, content) => `<span class="item-description-color" style="color:${color}">${content}</span>`);
}

function holylandPlayer(player) {
  const winner = player.result === "win";
  const name = escapeHtml(player.name);
  return `<div class="bracket-player ${winner ? "winner" : "loser"}">
    <span class="player-avatar" aria-hidden="true">
      <img class="avatar-image" src="assets/holyland/avatar/${escapeHtml(player.avatar_id)}.png" alt="">
      <img class="avatar-frame" src="assets/holyland/frame/${escapeHtml(player.frame_id)}.png" alt="">
    </span>
    <span class="player-identity">
      <span class="player-server">S${player.server_id}</span>
      <strong title="${name}">${name}</strong>
    </span>
    <span class="match-result">${winner ? "胜" : "负"}</span>
  </div>`;
}

function holylandMatch(match, extraClass = "") {
  return `<article class="bracket-match ${extraClass}">
    ${match.players.map(holylandPlayer).join("")}
  </article>`;
}

function drawBracketConnectors() {
  const board = els.holylandBracket.querySelector(".bracket-board");
  const svg = board?.querySelector(".bracket-connectors");
  const columns = board ? [...board.querySelectorAll(".bracket-column")] : [];
  if (!board || !svg || columns.length < 2) return;

  const boardRect = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  svg.replaceChildren();

  const pointFor = element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - boardRect.left,
      right: rect.right - boardRect.left,
      centerY: rect.top - boardRect.top + rect.height / 2,
    };
  };

  for (let columnIndex = 0; columnIndex < columns.length - 1; columnIndex += 1) {
    const sources = [...columns[columnIndex].querySelectorAll(":scope > .round-matches > .bracket-match")];
    const targets = [...columns[columnIndex + 1].querySelectorAll(":scope > .round-matches > .bracket-match")];

    targets.forEach((target, targetIndex) => {
      const upper = sources[targetIndex * 2];
      const lower = sources[targetIndex * 2 + 1];
      if (!upper || !lower) return;

      const upperPoint = pointFor(upper);
      const lowerPoint = pointFor(lower);
      const targetPoint = pointFor(target);
      const jointX = upperPoint.right + (targetPoint.left - upperPoint.right) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", [
        `M ${upperPoint.right} ${upperPoint.centerY} H ${jointX}`,
        `M ${lowerPoint.right} ${lowerPoint.centerY} H ${jointX}`,
        `M ${jointX} ${upperPoint.centerY} V ${lowerPoint.centerY}`,
        `M ${jointX} ${targetPoint.centerY} H ${targetPoint.left}`,
      ].join(" "));
      path.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(path);
    });
  }
}

function renderHolyland() {
  if (!state.holyland) return;
  const seasonLabel = HOLYLAND_SEASONS[state.holylandSeason]?.label || state.holylandSeason;
  const channelLabel = HOLYLAND_CHANNELS[state.holylandChannel]?.label || "未知系列";
  els.holylandResultLabel.textContent = `${seasonLabel}赛果`;
  els.holylandSummary.textContent = `${seasonLabel} · ${channelLabel} · 圣域${state.holyland.realm}区 · 比赛记录 ${state.holyland.captured_at_china} 读取`;
  els.holylandBracket.innerHTML = `<div class="bracket-board">
    <svg class="bracket-connectors" aria-hidden="true"></svg>
    ${state.holyland.rounds.map(round => `<section class="bracket-column bracket-${round.key}">
      <h3>${escapeHtml(round.label)}</h3>
      <div class="round-matches">
        ${round.matches.map(match => holylandMatch(match)).join("")}
      </div>
      ${round.key === "final" && state.holyland.bronze_match ? `<div class="bronze-block"><span>季军赛</span>${holylandMatch(state.holyland.bronze_match, "bronze-match")}</div>` : ""}
    </section>`).join("")}
  </div>`;
  requestAnimationFrame(() => {
    els.holylandBracket.scrollLeft = 0;
    els.holylandBracket.scrollTop = 0;
    requestAnimationFrame(drawBracketConnectors);
  });
}

async function loadHolyland() {
  if (state.holylandLoading) return;
  state.holylandLoading = true;
  els.holylandSummary.textContent = "正在读取比赛记录…";
  els.holylandBracket.innerHTML = '<div class="bracket-loading">正在读取比赛记录…</div>';
  try {
    const response = await fetch(`api/holyland/${encodeURIComponent(state.holylandSeason)}/${encodeURIComponent(state.holylandChannel)}/${encodeURIComponent(state.holylandRealm)}.json?t=${Date.now()}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.holyland = await response.json();
    renderHolyland();
  } catch (error) {
    els.holylandSummary.textContent = "比赛记录读取失败";
    els.holylandBracket.innerHTML = `<div class="bracket-loading error-message">无法读取圣域数据：${escapeHtml(error.message)}</div>`;
  } finally {
    state.holylandLoading = false;
  }
}

function iconStrip(rotation, compact = false) {
  if (!rotation || !rotation.ids?.length) return '<span class="no-rotation">尚未开启</span>';
  const images = rotation.ids.map((id, index) => {
    const name = rotation.names?.[index] || `角色 ${id}`;
    return `<img src="assets/icons/${id}.png" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" loading="lazy">`;
  }).join("");
  return `<div class="avatar-strip${compact ? " compact" : ""}" aria-label="${escapeHtml(rotation.label)}">${images}</div>`;
}

function rotationProgress(group) {
  return `<div class="rotation-progress" data-start="${escapeHtml(group.rotation_started_at)}" data-end="${escapeHtml(group.next_switch_at)}">
    <div class="progress-copy"><span>本期进度</span><strong class="remaining-time">正在计算…</strong></div>
    <div class="progress-track" role="progressbar" aria-label="当前轮替剩余时间" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
      <span class="progress-fill"></span>
    </div>
  </div>`;
}

function formatRemaining(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `剩余 ${days}天 ${hours}小时 ${minutes}分钟`;
}

function updateRotationProgress() {
  const progress = els.selected.querySelector(".rotation-progress");
  if (!progress) return;
  const startedAt = Date.parse(progress.dataset.start);
  const endsAt = Date.parse(progress.dataset.end);
  const now = Date.now();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return;
  const ratio = Math.min(1, Math.max(0, (now - startedAt) / (endsAt - startedAt)));
  const remainingRatio = 1 - ratio;
  progress.querySelector(".progress-fill").style.width = `${remainingRatio * 100}%`;
  progress.querySelector(".remaining-time").textContent = formatRemaining(endsAt - now);
  progress.querySelector(".progress-track").setAttribute("aria-valuenow", String(Math.round(remainingRatio * 100)));
  if (now >= endsAt && state.boundaryRefreshAt !== endsAt) {
    state.boundaryRefreshAt = endsAt;
    loadData();
  }
}

function statusInfo(group) {
  if (group.source === "unmerged") return ["未合服", "unmerged"];
  if (group.source === "unmerged_inferred") return ["未合服", "unmerged"];
  if (group.source === "merge_constraint" || group.status === "inferred_by_two_merge_size") return ["结构推定", "inferred"];
  if (group.source === "user_confirmed") return ["手工确认", "manual"];
  if (group.observed) return ["观测中", "observed"];
  if (group.status === "inferred") return ["推断边界", "inferred"];
  return ["已确认", ""];
}

function sidRange(group) {
  return group.start_sid === group.end_sid
    ? `S${group.start_sid}`
    : `S${group.start_sid}~S${group.end_sid}`;
}

function displayRange(group) {
  if (!group.display_start) return "—";
  if (group.display_start === group.display_end) return group.display_start;
  return `${group.display_start}~${group.display_end}`;
}

function renderSelected() {
  if (!state.data) return;
  if (!activeChannel().available) {
    els.selected.classList.remove("error-state");
    els.selected.innerHTML = `<div class="empty-state">${escapeHtml(activeChannel().label)}暂未接入合服数据。</div>`;
    return;
  }
  const group = state.data.groups.find(item => state.selectedSid >= item.start_sid && state.selectedSid <= item.end_sid);
  if (!group) {
    els.selected.innerHTML = `<div class="empty-state">S${escapeHtml(state.selectedSid)} 尚未出现在服务器轮替表中。</div>`;
    return;
  }
  const [status] = statusInfo(group);
  els.selected.classList.remove("error-state");
  els.selected.innerHTML = `
    <div class="selected-grid">
      <div class="group-facts">
        <span class="label">查询结果 · ${escapeHtml(status)}</span>
        <h2>${sidRange(group)}</h2>
        <div class="fact-line"><span>显示服范围</span><strong>${escapeHtml(displayRange(group))}</strong></div>
        <div class="fact-line"><span>日历开服</span><strong>${escapeHtml(group.calendar_open_time)}</strong></div>
        <div class="fact-line"><span>开服天数</span><strong>${group.open_days} 天</strong></div>
      </div>
      <div class="rotation-panel current">
        <div class="rotation-head"><span>当前虚空轮替</span><strong>${escapeHtml(group.current?.label || "尚未开启")}</strong></div>
        ${iconStrip(group.current)}
        ${rotationProgress(group)}
      </div>
      <div class="rotation-panel next">
        <div class="rotation-head"><span>下一期虚空</span><strong>${escapeHtml(group.next?.label || "—")}</strong></div>
        ${iconStrip(group.next)}
      </div>
    </div>`;
  updateRotationProgress();
}

function renderRows() {
  if (!activeChannel().available) {
    els.rows.innerHTML = `<tr class="empty-row"><td colspan="7">${escapeHtml(activeChannel().label)}暂无数据</td></tr>`;
    return;
  }
  const groups = [...state.data.groups].sort((a, b) => state.descending ? b.start_sid - a.start_sid : a.start_sid - b.start_sid);
  els.rows.innerHTML = groups.map(group => {
    const [status, statusClass] = statusInfo(group);
    const selected = state.selectedSid >= group.start_sid && state.selectedSid <= group.end_sid;
    return `<tr data-sid="${group.start_sid}" class="${selected ? "selected " : ""}${group.observed ? "observed" : ""}">
      <td class="group-name">${sidRange(group)}</td>
      <td>${escapeHtml(displayRange(group))}</td>
      <td class="number">${escapeHtml(group.calendar_open_time)}</td>
      <td class="number">${group.open_days} 天</td>
      <td>${iconStrip(group.current, true)}</td>
      <td>${iconStrip(group.next, true)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(status)}</span></td>
    </tr>`;
  }).join("");
  els.rows.querySelectorAll("tr").forEach(row => row.addEventListener("click", () => selectSid(Number(row.dataset.sid))));
}

function renderSummary() {
  els.summary.textContent = activeChannel().available
    ? `合服数据 ${state.data.updated_at_china} 更新`
    : "暂无数据";
}

function selectSid(sid) {
  state.selectedSid = sid;
  localStorage.setItem("voidRotationSid", String(sid));
  const url = new URL(location.href);
  url.searchParams.set("sid", sid);
  history.replaceState(null, "", url);
  els.search.value = `S${sid}`;
  renderSelected();
  renderRows();
  document.querySelector("tr.selected")?.scrollIntoView({block: "nearest", behavior: "smooth"});
}

function parseSearch(value) {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text.match(/\d+/)?.[0]);
  if (!Number.isFinite(number)) return null;
  if (/指尖像素|显示服/.test(text)) {
    const match = state.data.groups.find(group => number >= group.display_start_number && number <= group.display_end_number);
    return match?.start_sid ?? null;
  }
  return number;
}

function runSearch() {
  const sid = parseSearch(els.search.value);
  if (sid === null) {
    els.selected.classList.add("error-state");
    els.selected.innerHTML = '<div class="empty-state">请输入有效的区服编号。</div>';
    return;
  }
  selectSid(sid);
}

async function loadData(manual = false) {
  if (state.loading) return;
  if (!activeChannel().available) {
    state.data = {groups: [], updated_at_china: ""};
    state.secondsToRefresh = 0;
    els.search.disabled = true;
    els.searchButton.disabled = true;
    els.refreshButton.disabled = true;
    els.sortButton.disabled = true;
    els.refreshState.textContent = `${activeChannel().label} · 暂无数据`;
    renderSummary();
    renderSelected();
    renderRows();
    return;
  }
  state.loading = true;
  els.search.disabled = false;
  els.searchButton.disabled = false;
  els.sortButton.disabled = false;
  els.refreshButton.disabled = true;
  els.refreshState.textContent = manual ? "正在刷新…" : "正在读取数据…";
  try {
    const response = await fetch(`api/data/${encodeURIComponent(state.channel)}.json?t=${Date.now()}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.secondsToRefresh = 30;
    renderSummary();
    renderSelected();
    renderRows();
    els.refreshState.textContent = "已连接 · 30 秒后自动读取";
  } catch (error) {
    els.refreshState.textContent = `读取失败：${error.message}`;
    els.selected.classList.add("error-state");
    els.selected.innerHTML = '<div class="empty-state">无法读取本地数据，请确认启动窗口仍在运行。</div>';
  } finally {
    state.loading = false;
    els.refreshButton.disabled = false;
  }
}

function itemClassLabel(classId) {
  return classId ? `分类 ${classId}` : "未分类";
}

function filteredItems() {
  const query = state.itemQuery.trim().toLowerCase();
  return (state.items || []).filter(item => {
    if (state.itemClass !== "all" && String(item.class_id) !== state.itemClass) return false;
    return !query || item.name.toLowerCase().includes(query) || String(item.id).includes(query);
  });
}

function itemIcon(item, large = false) {
  if (!item.asset_token) return `<span class="item-icon-fallback">无素材</span>`;
  const source = `assets/item-assets/${encodeURIComponent(item.asset_token)}.png`;
  return `<img class="item-icon${large ? " large" : ""}" src="${source}" alt="">`;
}

function itemQualityClass(item) {
  const quality = Number(item.quality || 0);
  return quality ? ` quality-${Math.min(8, quality)}` : "";
}

function itemStars(item) {
  const value = Math.max(0, Number(item.star_count || 0));
  if (!value) return "";
  let mark = "sixjx1";
  let count = value;
  if (value >= 6 && value <= 10) { mark = "sixjx2"; count = value - 5; }
  else if (value >= 11 && value <= 15) { mark = "sixjx3"; count = value - 10; }
  else if (value >= 16 && value <= 20) { mark = "sixjx4"; count = value - 15; }
  else if (value > 20) { mark = "sixjx5"; count = 1; }
  const marks = Array.from({length: count}, () => `<img src="assets/star-marks/${mark}.png" alt="">`).join("");
  return `<span class="item-stars" aria-label="${value} 星">${marks}${value > 20 ? `<b>${value - 21}</b>` : ""}</span>`;
}

function itemSpecialBadges(item) {
  const quality = Number(item.quality || 0);
  if (!item.special_badge || quality < 1 || quality > 8) return "";
  const badge = quality - 1;
  return `<span class="item-special-badges" aria-hidden="true">
    <img class="item-special-badge item-special-badge-left" src="assets/xkcm/${badge}.png" alt="">
    <img class="item-special-badge item-special-badge-right" src="assets/xkcm/${badge}r.png" alt="">
  </span>`;
}

function itemChoiceBadge(item) {
  if (!['optional', 'random'].includes(item.choice_badge)) return '';
  const label = item.choice_badge === 'optional' ? '自选' : '随机';
  return `<span class="item-choice-badge item-choice-badge-${item.choice_badge}">
    <img src="assets/item-badges/${item.choice_badge}.png" alt=""><b>${label}</b>
  </span>`;
}

function heroCardOverlays(item) {
  if (!['hero', 'fragment', 'generic_fragment'].includes(item.asset_kind) && !item.is_hero_heart) return '';
  const strength = Number(item.hero_strength || 0);
  const realm = Number(item.hero_realm || 0);
  // xkfGHrRealm maps SP1..SP4 (7..10) back to factions 1..4.
  const realmIcon = realm >= 7 && realm <= 10 ? realm % 6 : Math.max(0, Math.min(5, realm));
  // griditem.ts folds strength 4 and 5 into the same S+ badge (simj4).
  const rank = strength >= 1 && strength <= 5 ? Math.min(strength, 4) : 0;
  return `<span class="hero-card-overlays" aria-hidden="true">
    ${rank ? `<img class="hero-card-rank" src="assets/hero-ui/simj${rank}.png" alt="">` : ''}
    <img class="hero-card-faction" src="assets/hero-ui/sizy${realmIcon}.png" alt="">
    ${item.is_fragment ? '<img class="hero-card-fragment" src="assets/hero-ui/sisp.png" alt="">' : ''}
    ${realm > 5 ? '<img class="hero-card-sp" src="assets/hero-ui/sp0.png" alt="">' : ''}
  </span>`;
}

function standaloneFragmentBadge(item) {
  if (!item.show_fragment_badge || item.is_fragment) return '';
  return '<img class="hero-card-fragment standalone-fragment-badge" src="assets/hero-ui/sisp.png" alt="">';
}

function itemCardVisual(item, large = false) {
  return `<span class="item-card-visual asset-${item.asset_kind || "item"}${large ? " large" : ""}${itemQualityClass(item)}">
    ${itemIcon(item, large)}${heroCardOverlays(item)}${standaloneFragmentBadge(item)}${itemSpecialBadges(item)}${itemChoiceBadge(item)}${itemStars(item)}
  </span>`;
}

function itemContents(item) {
  if (!item.contents?.length) return '';
  const label = item.choice_badge === 'optional' ? '可选内容' : '随机内容';
  const contentItems = item.contents.map(entry => {
    const content = state.items.find(candidate => candidate.id === entry.id);
    if (!content) return '';
    const countLabel = Number(entry.count) > 1 ? ` ×${entry.count}` : '';
    const title = escapeHtml(content.name + countLabel);
    return `<span class="item-content-icon" title="${title}" aria-label="${title}">${itemCardVisual(content)}<b class="item-content-count">${entry.count}</b></span>`;
  }).join('');
  return `<section class="item-detail-contents"><h4>${label}</h4><div class="item-content-grid">${contentItems}</div></section>`;
}

function renderItemDetail() {
  const item = (state.items || []).find(entry => entry.id === state.selectedItemId);
  if (!item) {
    els.itemDetail.innerHTML = '<div class="empty-state">选择一个物品查看详情。</div>';
    return;
  }
  els.itemDetail.innerHTML = `<div class="item-detail-content">
    <div class="item-detail-icon">${itemCardVisual(item, true)}</div>
    <div class="item-detail-title"><span class="eyebrow">物品编号 ${item.id}</span><h3>${escapeHtml(item.name)}</h3><span class="item-class">${escapeHtml(itemClassLabel(item.class_id))}</span></div>
    <p>${renderItemDescription(item.description || "暂无描述")}</p>
    ${itemContents(item)}
  </div>`;
}

function renderItems() {
  if (!state.items) return;
  const items = filteredItems();
  const pageCount = Math.max(1, Math.ceil(items.length / state.itemPageSize));
  state.itemPage = Math.max(1, Math.min(state.itemPage, pageCount));
  const start = (state.itemPage - 1) * state.itemPageSize;
  const visibleItems = items.slice(start, start + state.itemPageSize);
  els.itemSummary.textContent = `共 ${state.items.length.toLocaleString("zh-CN")} 件物品 · 筛选结果 ${items.length.toLocaleString("zh-CN")} 件`;
  els.itemPageSummary.textContent = items.length ? `第 ${state.itemPage} / ${pageCount} 页` : "没有结果";
  els.itemPrev.disabled = state.itemPage <= 1;
  els.itemNext.disabled = state.itemPage >= pageCount;
  if (!items.some(item => item.id === state.selectedItemId)) state.selectedItemId = items[0]?.id ?? null;
  els.itemGrid.innerHTML = visibleItems.length ? visibleItems.map(item => `<button class="item-card${item.id === state.selectedItemId ? " selected" : ""}" type="button" data-item-id="${item.id}">
    ${itemCardVisual(item)}<span class="item-card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="item-card-id">#${item.id}</span>
  </button>`).join("") : '<div class="empty-state">没有找到匹配的物品。</div>';
  els.itemGrid.querySelectorAll("[data-item-id]").forEach(card => card.addEventListener("click", () => {
    state.selectedItemId = Number(card.dataset.itemId);
    els.itemGrid.querySelector(".item-card.selected")?.classList.remove("selected");
    card.classList.add("selected");
    renderItemDetail();
  }));
  renderItemDetail();
  scheduleItemPageSize();
}

let itemPageSizeFrame = 0;

function scheduleItemPageSize() {
  cancelAnimationFrame(itemPageSizeFrame);
  itemPageSizeFrame = requestAnimationFrame(updateItemPageSize);
}

function updateItemPageSize() {
  if (state.view !== "encyclopedia" || !state.items || !els.itemGrid.offsetParent) return;
  const sampleCard = els.itemGrid.querySelector(".item-card");
  if (!sampleCard) return;
  const gridStyle = getComputedStyle(els.itemGrid);
  const columns = gridStyle.gridTemplateColumns.split(/\s+/).filter(Boolean).length || 1;
  const rowGap = Number.parseFloat(gridStyle.rowGap) || 0;
  const rowHeight = sampleCard.getBoundingClientRect().height;
  const paginationHeight = els.itemPageSummary.closest(".item-pagination")?.getBoundingClientRect().height || 48;
  const availableHeight = Math.max(rowHeight, window.innerHeight - els.itemGrid.getBoundingClientRect().top - paginationHeight - 22);
  const rows = Math.max(1, Math.floor((availableHeight + rowGap) / (rowHeight + rowGap)));
  const nextPageSize = rows * columns;
  if (nextPageSize === state.itemPageSize) return;
  const firstVisibleIndex = (state.itemPage - 1) * state.itemPageSize;
  state.itemPageSize = nextPageSize;
  state.itemPage = Math.floor(firstVisibleIndex / nextPageSize) + 1;
  renderItems();
}

async function loadItems() {
  if (state.itemsLoading) return;
  state.itemsLoading = true;
  els.itemSummary.textContent = "正在读取物品资料…";
  try {
    const response = await fetch(`api/items.json?t=${Date.now()}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.items = (await response.json()).items || [];
    const classes = [...new Set(state.items.map(item => item.class_id))].sort((a, b) => a - b);
    els.itemClassFilter.innerHTML = '<option value="all">全部物品</option>' + classes.map(id => `<option value="${id}">${escapeHtml(itemClassLabel(id))}</option>`).join("");
    els.itemClassFilter.value = state.itemClass;
    renderItems();
  } catch (error) {
    els.itemSummary.textContent = `读取失败：${error.message}`;
    els.itemGrid.innerHTML = '<div class="empty-state">无法读取物品资料，请确认启动窗口仍在运行。</div>';
  } finally {
    state.itemsLoading = false;
  }
}

els.searchButton.addEventListener("click", runSearch);
els.search.addEventListener("keydown", event => { if (event.key === "Enter") runSearch(); });
els.refreshButton.addEventListener("click", () => loadData(true));
els.channelSelect.addEventListener("change", () => {
  state.channel = els.channelSelect.value;
  localStorage.setItem("voidRotationChannel", state.channel);
  const url = new URL(location.href);
  if (state.channel === "xkbeta") url.searchParams.delete("channel");
  else url.searchParams.set("channel", state.channel);
  history.replaceState(null, "", url);
  loadData();
});
els.sortButton.addEventListener("click", () => {
  state.descending = !state.descending;
  localStorage.setItem("voidRotationDescending", String(state.descending));
  els.sortButton.textContent = state.descending ? "按新区优先" : "按老区优先";
  renderRows();
});
els.navigationTabs.forEach(tab => tab.addEventListener("click", () => setView(tab.dataset.view)));
els.globalTabs.forEach(tab => tab.addEventListener("click", () => setGlobalView(tab.dataset.globalView)));
els.itemSearch.addEventListener("input", () => {
  state.itemQuery = els.itemSearch.value;
  state.itemPage = 1;
  renderItems();
});
els.itemClassFilter.addEventListener("change", () => {
  state.itemClass = els.itemClassFilter.value;
  state.itemPage = 1;
  renderItems();
});
els.itemPrev.addEventListener("click", () => {
  state.itemPage -= 1;
  renderItems();
  els.itemGrid.scrollTop = 0;
});
els.itemNext.addEventListener("click", () => {
  state.itemPage += 1;
  renderItems();
  els.itemGrid.scrollTop = 0;
});
els.holylandRealm.addEventListener("change", () => {
  state.holylandRealm = els.holylandRealm.value;
  state.holyland = null;
  localStorage.setItem("holylandRealm", state.holylandRealm);
  loadHolyland();
});
els.holylandSeason.addEventListener("change", () => {
  state.holylandSeason = els.holylandSeason.value;
  state.holyland = null;
  localStorage.setItem("holylandSeason", state.holylandSeason);
  loadHolyland();
});
els.holylandChannel.addEventListener("change", () => {
  state.holylandChannel = els.holylandChannel.value;
  state.holyland = null;
  localStorage.setItem("holylandChannel", state.holylandChannel);
  populateHolylandRealms();
  loadHolyland();
});
window.addEventListener("resize", () => {
  requestAnimationFrame(drawBracketConnectors);
  scheduleItemPageSize();
});

setInterval(() => {
  els.clock.textContent = beijingNow();
  if (state.view === "global" && state.globalView === "activities") renderActivityCalendar();
  if (state.view !== "server" || !state.data || !activeChannel().available) return;
  updateRotationProgress();
  state.secondsToRefresh -= 1;
  if (state.secondsToRefresh <= 0) loadData();
  else els.refreshState.textContent = `已连接 · ${state.secondsToRefresh} 秒后自动读取`;
}, 1000);

els.clock.textContent = beijingNow();
els.search.value = `S${state.selectedSid}`;
els.channelSelect.value = state.channel;
els.holylandChannel.value = state.holylandChannel;
populateHolylandSeasons();
populateHolylandRealms();
setGlobalView(state.globalView);
els.sortButton.textContent = state.descending ? "按新区优先" : "按老区优先";
setView(state.view, false);
