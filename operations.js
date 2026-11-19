"use strict";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const aktobeOffset = 5 * hour;
const visitStorageKey = "tradecontrol.visits.v1";
const visitDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Aqtobe", dateStyle: "medium", timeStyle: "short",
});

function dateInputValue(timestamp) {
  return new Date(timestamp + aktobeOffset).toISOString().slice(0, 16);
}

function demoVisits() {
  const now = Math.floor(Date.now() / 60000) * 60000;
  return [
    { id: "demo-arman", store: "Арман", at: now - day, status: "missed" },
    { id: "demo-merey", store: "Мерей", at: now - day - hour, status: "done" },
    { id: "demo-aray", store: "Арай", at: now - 15 * 60000, status: "planned" },
    { id: "demo-samal", store: "Самал", at: now + 40 * 60000, status: "planned" },
    { id: "demo-dostyk", store: "Достык", at: now + day, status: "planned" },
  ];
}

function loadVisits() {
  try {
    const saved = JSON.parse(localStorage.getItem(visitStorageKey));
    if (Array.isArray(saved)) return saved;
  } catch {
    // A browser without storage access can still display the demo.
  }
  return demoVisits();
}

let visits = loadVisits();
let replacing = null;
let scheduleRepresentative = "";
let scheduleMode = "manager";
const visitDialog = byId("visit-dialog");
const visitForm = byId("visit-form");
const visitTime = byId("visit-time");
const visitStore = byId("visit-store");
const scheduleStatus = byId("schedule-status");
const teamVisitRep = byId("team-visit-rep");
const storeRecord = (name) => stores.find((store) => store.name === name);

function retainVisits(next, message = "", activity = null) {
  let persisted = true;
  try {
    localStorage.setItem(visitStorageKey, JSON.stringify(next));
  } catch {
    persisted = false;
  }
  visits = next;
  const lastUpdate = persisted ? message : "Браузер не сохранил расписание. Изменения действуют до закрытия страницы.";
  const feedback = byId("visit-feedback");
  feedback.hidden = !lastUpdate;
  feedback.textContent = lastUpdate;
  renderSchedule();
  window.dispatchEvent(new CustomEvent("tradecontrol:visits-changed", { detail: activity }));
}

function showView(viewId) {
  for (const button of document.querySelectorAll(".dashboard-nav button")) {
    const target = button.getAttribute("aria-controls");
    button.setAttribute("aria-pressed", String(target === viewId && !button.closest("nav").hidden));
    byId(target).hidden = target !== viewId;
  }
}

for (const button of document.querySelectorAll(".dashboard-nav button")) {
  button.addEventListener("click", () => showView(button.getAttribute("aria-controls")));
}

byId("open-reminders").addEventListener("click", () => {
  showView("schedule-view");
  byId("schedule-heading").scrollIntoView({ block: "nearest" });
});

function renderReminders(now) {
  const alerts = visits
    .filter((visit) => scheduleMode === "staff" && storeRecord(visit.store).rep === scheduleRepresentative && visit.status === "planned" && visit.at <= now + hour)
    .sort((a, b) => a.at - b.at);
  const upcoming = alerts.filter((visit) => visit.at > now).length;
  const overdue = alerts.length - upcoming;
  const messages = [];
  if (upcoming) messages.push(`Визиты в ближайший час: ${upcoming}`);
  if (overdue) messages.push(`Визиты без отметки: ${overdue}`);
  const reminderText = byId("reminder-text");
  const message = messages.join(" · ");
  if (reminderText.textContent !== message) reminderText.textContent = message;
  byId("reminder-banner").hidden = !alerts.length;
  byId("reminder-empty").hidden = Boolean(alerts.length);
  byId("reminder-list").replaceChildren(...alerts.map((visit) => {
    const time = visitDate.format(visit.at);
    const status = visit.at <= now ? "Отметьте итог визита" : "Скоро визит";
    return makeElement("li", `${status} · ${visit.store} · ${storeRecord(visit.store).rep} · ${time}`);
  }));
}

function visitButton(label, handler, primary = false) {
  const button = makeElement("button", label, primary ? "action-primary" : "");
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function markVisit(id, status) {
  const visit = visits.find((entry) => entry.id === id);
  if (!visit || visit.at > Date.now() || visit.replacedBy) return;
  const rep = storeRecord(visit.store).rep;
  if (scheduleMode === "staff" && (rep !== scheduleRepresentative || visit.status !== "planned")) return;
  if (visit.status === status && visit.markedBy === scheduleMode) return;
  const updated = visits.map((entry) => entry.id === id ? { ...entry, status, markedBy: scheduleMode } : entry);
  const missed = status === "missed";
  const marker = scheduleMode === "manager" ? "Отметил руководитель" : "Отметил представитель";
  retainVisits(updated, missed ? "Визит отмечен как пропущенный. Его можно перенести." : "Визит отмечен как состоявшийся.", {
    rep,
    title: missed ? "Визит пропущен" : "Визит состоялся",
    detail: `${visit.store} · ${visitDate.format(visit.at)} · ${marker}`,
  });
}

function saveCalendarEvent(visit) {
  const eventTime = (timestamp) => new Date(timestamp).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const calendar = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lumen//Visit//RU",
    "BEGIN:VEVENT", `UID:${visit.id}@tradecontrol`, `DTSTAMP:${eventTime(Date.now())}`,
    `DTSTART:${eventTime(visit.at)}`, `DTEND:${eventTime(visit.at + 30 * 60000)}`,
    `SUMMARY:Визит · ${visit.store}`, `DESCRIPTION:Представитель · ${storeRecord(visit.store).rep}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H", "DESCRIPTION:Торговый визит через час",
    "END:VALARM", "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lumen-visit.ics";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderVisit(visit, now) {
  const store = storeRecord(visit.store);
  const row = makeElement("article", undefined, "visit-row");
  const info = makeElement("div");
  const time = makeElement("div");
  const buttons = makeElement("div", undefined, "visit-actions");
  const overdue = visit.status === "planned" && visit.at <= now;
  const replacement = visits.find((entry) => entry.id === visit.replacedBy);
  const original = visits.find((entry) => entry.id === visit.rescheduledFrom);
  const labels = { planned: "Запланирован", done: "Состоялся", missed: "Пропущен" };
  const status = makeElement("span", overdue ? "Ожидает отметки" : labels[visit.status], "visit-status");
  status.dataset.status = overdue ? "overdue" : visit.status;
  info.append(makeElement("strong", visit.store), makeElement("p", `${store.city} · ${store.rep}`, "visit-meta"));
  time.append(makeElement("p", visitDate.format(visit.at)), status);
  if (visit.markedBy) {
    time.append(makeElement("p", visit.markedBy === "manager" ? "Отметил руководитель" : "Отметил представитель", "visit-meta"));
  }
  if (replacement) time.append(makeElement("p", `Перенесён на ${visitDate.format(replacement.at)}`, "visit-meta"));
  if (original) time.append(makeElement("p", `Перенесён с ${visitDate.format(original.at)}`, "visit-meta"));

  if (scheduleMode === "manager" && visit.at <= now && !replacement) {
    const attended = visitButton("Посетил", () => markVisit(visit.id, "done"));
    const absent = visitButton("Не посетил", () => markVisit(visit.id, "missed"));
    attended.disabled = visit.markedBy === "manager" && visit.status === "done";
    absent.disabled = visit.markedBy === "manager" && visit.status === "missed";
    buttons.append(attended, absent);
  } else if (overdue) {
    buttons.append(visitButton("Состоялся", () => markVisit(visit.id, "done")));
    buttons.append(visitButton("Пропущен", () => markVisit(visit.id, "missed")));
  } else if (visit.status === "planned" && scheduleMode === "staff") {
    buttons.append(visitButton("В календарь", () => saveCalendarEvent(visit)));
  }
  if (visit.status === "missed" && !replacement) {
    buttons.append(visitButton("Перенести", () => openVisitForm(visit), true));
  }
  row.append(info, time, buttons);
  return row;
}

function renderSchedule() {
  const now = Date.now();
  const filter = scheduleMode === "manager" ? teamVisitRep.value : scheduleRepresentative;
  const visible = visits.filter((visit) => {
    const matchesRep = !filter || storeRecord(visit.store).rep === filter;
    const matchesStatus = !scheduleStatus.value || visit.status === scheduleStatus.value;
    return matchesRep && matchesStatus;
  }).sort((a, b) => a.at - b.at);
  byId("visit-empty").hidden = Boolean(visible.length);
  byId("visit-list").replaceChildren(...visible.map((visit) => renderVisit(visit, now)));
  renderReminders(now);
}

function setScheduleContext(role, rep) {
  scheduleMode = role;
  scheduleRepresentative = rep;
  const manager = role === "manager";
  byId("schedule-heading").textContent = manager ? "Визиты команды" : "Расписание визитов";
  byId("team-visit-filter").hidden = !manager;
  byId("new-visit").hidden = manager;
  byId("reminders").hidden = manager;
  visitStore.replaceChildren(...stores.filter((store) => store.rep === rep).map(({ name }) => new Option(name, name)));
  renderSchedule();
}

function openVisitForm(visit = null) {
  replacing = visit;
  visitForm.reset();
  byId("visit-dialog-title").textContent = visit ? "Перенести визит" : "Запланировать визит";
  byId("reschedule-context").hidden = !visit;
  byId("reschedule-context").textContent = visit ? `${visit.store} · Был назначен на ${visitDate.format(visit.at)}` : "";
  byId("visit-store-label").hidden = Boolean(visit);
  visitStore.disabled = Boolean(visit);
  visitTime.min = dateInputValue(Date.now() + 60000);
  visitTime.value = dateInputValue(Date.now() + (visit ? day : hour));
  byId("visit-error").hidden = true;
  visitDialog.showModal();
  (visit ? visitTime : visitStore).focus();
}

function showVisitError(message) {
  const error = byId("visit-error");
  error.textContent = message;
  error.hidden = false;
}

visitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const at = Date.parse(`${visitTime.value}:00+05:00`);
  const store = replacing?.store ?? visitStore.value;
  const assignedStore = storeRecord(store);
  const permitted = scheduleMode === "manager" ? Boolean(replacing) : assignedStore?.rep === scheduleRepresentative;
  if (!assignedStore || !permitted) {
    showVisitError("Выберите торговую точку вашего профиля.");
    return;
  }
  if (!Number.isFinite(at) || at <= Date.now()) {
    showVisitError("Выберите дату и время в будущем.");
    return;
  }
  const conflict = visits.some((visit) => visit.status === "planned" && visit.at === at && storeRecord(visit.store).rep === assignedStore.rep);
  if (conflict) {
    showVisitError("У представителя уже запланирован визит на это время.");
    return;
  }
  const original = replacing && visits.find((visit) => visit.id === replacing.id);
  if (replacing && (!original || original.status !== "missed" || original.replacedBy)) {
    showVisitError("Этот визит уже изменился. Закройте форму и проверьте расписание.");
    return;
  }
  const newVisit = { id: crypto.randomUUID(), store, at, status: "planned" };
  let updated = visits;
  if (original) {
    newVisit.rescheduledFrom = original.id;
    updated = visits.map((visit) => visit.id === original.id ? { ...visit, replacedBy: newVisit.id } : visit);
  }
  visitDialog.close();
  if (scheduleStatus.value && scheduleStatus.value !== "planned") scheduleStatus.value = "planned";
  retainVisits([...updated, newVisit], original ? "Визит перенесён. Исходная запись сохранена в истории." : "Визит добавлен в расписание.", {
    rep: assignedStore.rep,
    title: original ? "Визит перенесён" : "Визит запланирован",
    detail: `${store} · ${visitDate.format(at)}`,
  });
});

scheduleStatus.addEventListener("change", renderSchedule);
teamVisitRep.replaceChildren(new Option("Все", ""), ...reps.map((rep) => new Option(rep, rep)));
teamVisitRep.addEventListener("change", renderSchedule);
byId("new-visit").addEventListener("click", () => openVisitForm());
byId("cancel-visit").addEventListener("click", () => visitDialog.close());
window.addEventListener("storage", (event) => {
  if (event.key === visitStorageKey) {
    visits = loadVisits();
    renderSchedule();
    window.dispatchEvent(new CustomEvent("tradecontrol:visits-changed"));
  }
});
retainVisits(visits);
let lastMinute = Math.floor(Date.now() / 60000);
window.setInterval(() => {
  const minute = Math.floor(Date.now() / 60000);
  if (minute === lastMinute || byId("visit-list").contains(document.activeElement)) return;
  lastMinute = minute;
  renderSchedule();
}, 15000);

const equipment = [
  { name: "Морозильник", present: (store) => store.freezer },
  { name: "Холодильная витрина", present: (store) => store.name !== "Арай" },
  { name: "Термометр", present: (store) => store.name !== "Арман" },
  { name: "Торговый стеллаж", present: (store) => store.name !== "Достык" },
];

function showInventory() {
  const missingOnly = byId("equipment-filter").value === "missing";
  const visible = stores.filter((store) => !missingOnly || equipment.some((item) => !item.present(store)));
  const header = makeElement("tr");
  for (const name of ["Торговая точка", ...equipment.map((item) => item.name), "Недостача"]) {
    const cell = makeElement("th", name);
    cell.scope = "col";
    header.append(cell);
  }
  const head = document.createElement("thead");
  head.append(header);
  const body = document.createElement("tbody");
  for (const store of visible) {
    const row = makeElement("tr");
    const name = makeElement("th", store.name);
    name.scope = "row";
    row.append(name);
    const missing = [];
    for (const item of equipment) {
      const present = item.present(store);
      if (!present) missing.push(item.name);
      row.append(makeElement("td", present ? "В наличии" : "Отсутствует", present ? "equipment-ok" : "equipment-missing"));
    }
    row.append(makeElement("td", missing.join(", ") || "—"));
    body.append(row);
  }
  byId("equipment-table").replaceChildren(head, body);
}

byId("equipment-summary").replaceChildren(...equipment.map((item) => {
  const missing = stores.filter((store) => !item.present(store));
  const card = makeElement("section", undefined, "card");
  card.append(makeElement("h3", item.name));
  card.append(makeElement("strong", `${stores.length - missing.length} из ${stores.length}`));
  card.append(makeElement("p", missing.length ? `Отсутствует: ${missing.map(({ name }) => name).join(", ")}` : "В наличии во всех точках"));
  return card;
}));
byId("equipment-filter").addEventListener("change", showInventory);
showInventory();
