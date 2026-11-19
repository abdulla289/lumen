"use strict";

const roleStorageKey = "tradecontrol.team.v1";
const staffName = byId("staff-name");
const taskFilter = byId("task-filter");
const taskDialog = byId("task-dialog");
const assignForm = byId("assign-task-form");
let activeRole = "home";
const accountMenu = byId("account-menu");

function initialTeamData() {
  const now = Date.now();
  const demoTasks = [
    ["Арман", "Уточнить наличие товара и согласовать пополнение", 1, false],
    ["Мерей", "Сверить заявку магазина с недельным планом", 2, true],
    ["Самал", "Уточнить, где находится морозильник, и согласовать его размещение", 1, false],
    ["Достык", "Проверить наличие торгового стеллажа", 2, false],
    ["Арай", "Уточнить наличие холодильной витрины и отметить итог последнего визита", 1, false],
    ["Байтерек", "Проверить остатки перед следующей поставкой", 2, true],
  ];
  return {
    tasks: demoTasks.map(([store, description, days, done], index) => ({
      id: `demo-task-${index}`, store, description, due: now + days * day, done,
    })),
    reports: visits.filter((visit) => visit.status !== "planned").map((visit) => ({
      id: `demo-report-${visit.id}`, rep: storeRecord(visit.store).rep,
      title: visit.status === "done" ? "Визит состоялся" : "Визит пропущен",
      detail: `${visit.store} · ${visitDate.format(visit.at)}`, at: visit.at, read: false,
    })),
  };
}

function loadTeamData() {
  try {
    const saved = JSON.parse(localStorage.getItem(roleStorageKey));
    if (saved && Array.isArray(saved.tasks) && Array.isArray(saved.reports)) return saved;
  } catch {
    // The demo remains usable in memory when storage is unavailable.
  }
  return initialTeamData();
}

let team = loadTeamData();

function saveTeamData() {
  try {
    localStorage.setItem(roleStorageKey, JSON.stringify(team));
    return true;
  } catch {
    return false;
  }
}

function setFeedback(id, text) {
  const element = byId(id);
  element.textContent = text;
  element.hidden = !text;
}

function addReport(activity) {
  team.reports.unshift({ ...activity, id: crypto.randomUUID(), at: Date.now(), read: false });
}

function repStats(rep) {
  const points = stores.filter((store) => store.rep === rep);
  const schedule = visits.filter((visit) => storeRecord(visit.store).rep === rep);
  const tasks = team.tasks.filter((task) => storeRecord(task.store).rep === rep);
  const sales = points.reduce((total, store) => total + store.sales, 0);
  const plan = points.reduce((total, store) => total + store.plan, 0);
  return {
    points, sales, plan,
    planRate: plan ? percent.format(sales / plan) : "—",
    visited: schedule.filter((visit) => visit.status === "done").length,
    missed: schedule.filter((visit) => visit.status === "missed").length,
    tasksDone: tasks.filter((task) => task.done).length,
    tasksTotal: tasks.length,
  };
}

function reportRow(values) {
  const row = makeElement("tr");
  const [name, ...rest] = values;
  const title = makeElement("th", name);
  title.scope = "row";
  row.append(title, ...rest.map((value) => makeElement("td", value)));
  return row;
}

function renderReports() {
  byId("team-report").replaceChildren(...reps.map((rep) => {
    const stats = repStats(rep);
    return reportRow([rep, money(stats.sales), stats.planRate, stats.visited, stats.missed, `${stats.tasksDone} из ${stats.tasksTotal}`]);
  }));
  const unread = team.reports.filter((report) => !report.read).length;
  const badge = byId("report-nav-count");
  badge.textContent = unread;
  badge.hidden = !unread;
  byId("read-reports").hidden = !unread;
  byId("inbox-empty").hidden = Boolean(team.reports.length);
  byId("report-inbox").replaceChildren(...[...team.reports].sort((a, b) => b.at - a.at).map((report) => {
    const entry = makeElement("li", undefined, report.read ? "inbox-item" : "inbox-item is-new");
    const text = makeElement("div");
    text.append(makeElement("strong", `${report.rep} · ${report.title}`), makeElement("p", report.detail));
    const time = makeElement("time", visitDate.format(report.at), "report-time");
    time.dateTime = new Date(report.at).toISOString();
    entry.append(text, time);
    return entry;
  }));
}

function completeTask(id) {
  const task = team.tasks.find((entry) => entry.id === id);
  if (!task || task.done || storeRecord(task.store).rep !== staffName.value) return;
  task.done = true;
  addReport({ rep: staffName.value, title: "Задача выполнена", detail: `${task.store} · ${task.description}` });
  const saved = saveTeamData();
  setFeedback("task-feedback", saved ? "Задача выполнена. Руководитель получил отметку в отчётах." : "Задача отмечена в этой вкладке. Браузер не сохранил изменения.");
  renderTeam();
}

function renderTasks() {
  byId("tasks-rep").textContent = staffName.value;
  const status = taskFilter.value;
  const now = Date.now();
  const assigned = team.tasks.filter((task) => {
    return storeRecord(task.store).rep === staffName.value && (!status || task.done === (status === "done"));
  }).sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due);
  byId("task-empty").hidden = Boolean(assigned.length);
  byId("task-list").replaceChildren(...assigned.map((task) => {
    const row = makeElement("article", undefined, "task-row");
    const info = makeElement("div");
    const late = !task.done && task.due < now;
    const label = task.done ? "Выполнена" : late ? "Срок истёк" : "К выполнению";
    const stateClass = task.done ? "task-state task-done" : late ? "task-state task-late" : "task-state";
    info.append(
      makeElement("h4", task.description),
      makeElement("p", `${task.store} · Срок ${visitDate.format(task.due)}`, "task-meta"),
      makeElement("p", label, stateClass),
    );
    row.append(info);
    if (!task.done) row.append(visitButton("Отметить выполненной", () => completeTask(task.id), true));
    return row;
  }));
}

function renderStaffStats() {
  const rep = staffName.value;
  const stats = repStats(rep);
  byId("stats-rep").textContent = `${rep} · Продажи за неделю и итоги работы`;
  const metrics = [
    ["Продажи за неделю", money(stats.sales), `План ${money(stats.plan)}`],
    ["Выполнение плана", stats.planRate, `${stats.points.length} торговые точки`],
    ["Визиты состоялись", stats.visited, `Пропущено: ${stats.missed}`],
    ["Задачи выполнены", `${stats.tasksDone} из ${stats.tasksTotal}`, `Осталось: ${stats.tasksTotal - stats.tasksDone}`],
  ];
  byId("staff-metrics").replaceChildren(...metrics.map(([label, value, hint]) => {
    const card = makeElement("section", undefined, "card");
    card.append(makeElement("h3", label), makeElement("strong", value), makeElement("p", hint));
    return card;
  }));
  byId("staff-sales").replaceChildren(...stats.points.map((store) => reportRow([
    store.name, money(store.sales), money(store.plan), store.plan ? percent.format(store.sales / store.plan) : "—",
  ])));
}

function renderTeam() {
  renderReports();
  renderTasks();
  renderStaffStats();
  window.dispatchEvent(new Event("tradecontrol:team-rendered"));
}

function switchRole(role) {
  activeRole = role;
  const home = role === "home";
  const staff = role === "staff";
  byId("home-view").hidden = !home;
  byId("app-navigation").hidden = home;
  byId("app-views").hidden = home;
  for (const [name, id] of [["manager", "manager-role"], ["staff", "staff-role"]]) {
    const link = byId(id);
    if (role === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (visitDialog.open) visitDialog.close();
  if (taskDialog.open) taskDialog.close();
  if (byId("meeting-dialog").open) byId("meeting-dialog").close();
  byId("manager-nav").hidden = staff;
  byId("staff-nav").hidden = !staff;
  byId("staff-picker").hidden = !staff;
  scheduleStatus.value = "";
  setFeedback("visit-feedback", "");
  setScheduleContext(staff ? "staff" : "manager", staff ? staffName.value : "");
  renderTeam();
  showView(home ? null : staff ? "schedule-view" : "overview-view");
}

staffName.replaceChildren(...reps.map((rep) => new Option(rep, rep)));

function openRoute() {
  const route = location.hash.slice(1);
  switchRole(route === "staff" || route === "manager" ? route : "home");
  accountMenu.open = false;
}

accountMenu.querySelector("nav").addEventListener("click", (event) => {
  if (event.target.closest("a")) accountMenu.open = false;
});
accountMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && accountMenu.open) {
    accountMenu.open = false;
    accountMenu.querySelector("summary").focus();
  }
});
window.addEventListener("hashchange", () => {
  openRoute();
  window.scrollTo(0, 0);
});
staffName.addEventListener("change", () => {
  scheduleStatus.value = "";
  taskFilter.value = "";
  setFeedback("visit-feedback", "");
  setFeedback("task-feedback", "");
  setFeedback("summary-feedback", "");
  setScheduleContext("staff", staffName.value);
  renderTeam();
});
taskFilter.addEventListener("change", renderTasks);

byId("read-reports").addEventListener("click", () => {
  for (const report of team.reports) report.read = true;
  saveTeamData();
  renderReports();
});

byId("send-summary").addEventListener("click", () => {
  const rep = staffName.value;
  const stats = repStats(rep);
  addReport({ rep, title: "Сводка представителя", detail:
    `Продажи ${money(stats.sales)} · План ${stats.planRate} · Визиты ${stats.visited}, пропущено ${stats.missed} · Задачи ${stats.tasksDone} из ${stats.tasksTotal}` });
  const saved = saveTeamData();
  setFeedback("summary-feedback", saved ? "Сводка добавлена во входящие отчёты руководителя." : "Сводка добавлена в этой вкладке. Браузер не сохранил изменения.");
  renderReports();
});

byId("task-store").replaceChildren(...stores.map(({ name, rep }) => new Option(`${name} · ${rep}`, name)));
byId("assign-task").addEventListener("click", () => {
  assignForm.reset();
  const due = byId("task-due");
  due.min = dateInputValue(Date.now() + 60000);
  due.value = dateInputValue(Date.now() + day);
  setFeedback("assign-task-error", "");
  taskDialog.showModal();
});
byId("cancel-task").addEventListener("click", () => taskDialog.close());
assignForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const store = byId("task-store").value;
  const description = byId("task-description").value.trim();
  const due = Date.parse(`${byId("task-due").value}:00+05:00`);
  if (activeRole !== "manager" || !description || !Number.isFinite(due) || due <= Date.now()) {
    setFeedback("assign-task-error", "Добавьте описание и укажите срок в будущем.");
    return;
  }
  team.tasks.push({ id: crypto.randomUUID(), store, description, due, done: false });
  const saved = saveTeamData();
  taskDialog.close();
  setFeedback("assign-feedback", saved ? `Задача добавлена в кабинет сотрудника ${storeRecord(store).rep}.` : "Задача добавлена в этой вкладке. Браузер не сохранил изменения.");
  renderTeam();
});

window.addEventListener("tradecontrol:visits-changed", (event) => {
  if (event.detail) {
    addReport(event.detail);
    saveTeamData();
  }
  renderTeam();
});
window.addEventListener("storage", (event) => {
  if (event.key === roleStorageKey) {
    team = loadTeamData();
    renderTeam();
  }
});
saveTeamData();
openRoute();
