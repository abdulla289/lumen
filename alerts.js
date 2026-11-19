"use strict";

const caseAlertStorageKey = "lumen.read-case-alerts.v1";
const alertList = byId("case-alert-list");
let caseAlertFingerprint = "";

function loadReadCaseAlerts() {
  try {
    const saved = JSON.parse(localStorage.getItem(caseAlertStorageKey));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

let readCaseAlerts = loadReadCaseAlerts();

function openFreezerAlert(storeName) {
  freezerStore.value = storeName;
  freezerDay.value = freezerDays.at(-1);
  renderFreezerView();
  showView("freezers-view");
  byId("freezers-heading").scrollIntoView({ block: "start" });
}

function openEmployeeAlert(rep) {
  reasonRep.value = rep;
  renderRepReasons();
  showView("diagnostics-view");
  byId("diagnostics-heading").scrollIntoView({ block: "start" });
}

function openVisitAlert(rep, status) {
  teamVisitRep.value = rep;
  scheduleStatus.value = status;
  renderSchedule();
  showView("schedule-view");
  byId("schedule-heading").scrollIntoView({ block: "start" });
}

function collectCaseAlerts(now) {
  const alerts = [];
  const lastDayIndex = freezerDays.length - 1;
  for (const store of stores) {
    const latest = freezerRecord(store, lastDayIndex);
    if (store.freezer && latest.units === 0) {
      alerts.push({
        id: `zero:${store.name}:${latest.date}`, title: `«${store.name}» · ларь установлен, продаж нет`,
        detail: `${freezerDayName(latest.date)} · 0 шт. · посетителей: ${integer.format(latest.visitors)} · ${freezerLabels[latest.condition]}`,
        open: () => openFreezerAlert(store.name),
      });
    }
  }

  for (const rep of reps) {
    const assigned = visits.filter((visit) => visitRep(visit) === rep);
    const missed = assigned.filter((visit) => visit.status === "missed" && visit.at >= now - 7 * day && visit.at <= now);
    const distinct = [...new Set(missed.map(({ store }) => store))];
    if (distinct.length) {
      alerts.push({
        id: `missed:${rep}:${missed.map(({ id }) => id).sort().join(",")}`,
        title: `${rep} · пропущено точек: ${distinct.length}`,
        detail: `За последние 7 дней: ${distinct.join(", ")}.`,
        open: () => openVisitAlert(rep, "missed"),
      });
    }
    const overdue = assigned.filter((visit) => visit.status === "planned" && visit.at <= now);
    if (overdue.length) {
      alerts.push({
        id: `overdue:${rep}:${overdue.map(({ id }) => id).sort().join(",")}`,
        title: `${rep} · визитов без отметки: ${overdue.length}`,
        detail: `Время визита прошло: ${[...new Set(overdue.map(({ store }) => store))].join(", ")}.`,
        open: () => openVisitAlert(rep, "planned"),
      });
    }

    const { previous, sales, plan } = weeklyRepTotals(rep);
    if (previous > 0 && sales * 100 <= previous * 70) {
      alerts.push({
        id: `sales:${rep}:${previous}:${sales}`,
        title: `${rep} · продажи ${signed.format((sales - previous) / previous)}`,
        detail: `${money(previous)} → ${money(sales)} по всем точкам за неделю.`,
        open: () => openEmployeeAlert(rep),
      });
    }
    if (plan > 0 && sales * 2 <= plan) {
      alerts.push({
        id: `plan:${rep}:${sales}:${plan}`, title: `${rep} · выполнено ${percent.format(sales / plan)} плана`,
        detail: `${money(sales)} из ${money(plan)}. Недобор ${money(plan - sales)}.`,
        open: () => openEmployeeAlert(rep),
      });
    }
  }

  for (const store of stores.filter(({ freezer }) => !freezer)) {
    alerts.push({
      id: `missing-freezer:${store.name}`, title: `«${store.name}» · ларь отсутствует`,
      detail: "По данным последней проверки оборудования.", open: () => openFreezerAlert(store.name),
    });
  }
  return alerts;
}

function markCaseAlertsRead(ids) {
  for (const id of ids) readCaseAlerts.add(id);
  try {
    localStorage.setItem(caseAlertStorageKey, JSON.stringify([...readCaseAlerts]));
  } catch {
    // Read marks still apply in this tab when browser storage is blocked.
  }
  renderCaseAlerts();
}

function renderCaseAlerts() {
  const alerts = collectCaseAlerts(Date.now());
  const fingerprint = JSON.stringify(alerts.map(({ id, detail }) => [id, detail, readCaseAlerts.has(id)]));
  if (fingerprint === caseAlertFingerprint) return;
  caseAlertFingerprint = fingerprint;
  const count = alerts.filter(({ id }) => !readCaseAlerts.has(id)).length;
  const badge = byId("case-alert-count");
  badge.textContent = count;
  badge.hidden = !count;
  byId("read-case-alerts").hidden = !count;
  byId("case-alert-empty").hidden = Boolean(alerts.length);
  alertList.replaceChildren(...alerts.map((alert) => {
    const read = readCaseAlerts.has(alert.id);
    const row = makeElement("li", undefined, read ? "inbox-item" : "inbox-item is-new");
    const body = makeElement("div");
    body.append(makeElement("strong", alert.title), makeElement("p", alert.detail, "secondary-text"));
    const open = visitButton("Открыть", () => {
      markCaseAlertsRead([alert.id]);
      alert.open();
    });
    open.setAttribute("aria-label", `Открыть: ${alert.title}`);
    row.append(body, open);
    return row;
  }));
}

byId("read-case-alerts").addEventListener("click", () => markCaseAlertsRead(collectCaseAlerts(Date.now()).map(({ id }) => id)));
window.addEventListener("tradecontrol:team-rendered", renderCaseAlerts);
window.addEventListener("storage", (event) => {
  if (event.key === caseAlertStorageKey) {
    readCaseAlerts = loadReadCaseAlerts();
    renderCaseAlerts();
  }
});
window.setInterval(renderCaseAlerts, 15000);
renderCaseAlerts();
