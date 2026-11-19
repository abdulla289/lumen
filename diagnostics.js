"use strict";

const weekOrders = {
  "Арман": [20, 14],
  "Мерей": [22, 24],
  "Достык": [19, 20],
  "Самал": [20, 20],
  "Байтерек": [14, 15],
  "Арай": [20, 21],
};

const reasonRep = byId("reason-rep");
const reasonStore = byId("reason-store");

function diagnosticKpi(value, supportingText, emphasis) {
  const row = makeElement("div", undefined, "diagnostic-kpis");
  row.append(makeElement("strong", value, emphasis), makeElement("span", supportingText));
  return row;
}

function reasonCard(text) {
  const card = makeElement("div", undefined, "diagnostic-reason");
  card.append(makeElement("h4", "Причина"), makeElement("p", text));
  return card;
}

function diagnosticList(title, items) {
  const group = makeElement("div", undefined, "diagnostic-group");
  const list = makeElement("ul");
  list.append(...items.map((item) => makeElement("li", item)));
  group.append(makeElement("h4", title), list);
  return group;
}

function openStoreReason(name) {
  reasonStore.value = name;
  showView("diagnostics-view");
  renderStoreReasons();
  byId("store-reason-heading").scrollIntoView({ block: "nearest" });
  reasonStore.focus({ preventScroll: true });
}

function shortfallRow(store) {
  const item = makeElement("li");
  const body = makeElement("div");
  const change = store.previous ? signed.format((store.sales - store.previous) / store.previous) : "—";
  body.append(makeElement("strong", store.name), makeElement("p", `Недобор ${money(store.plan - store.sales)} · ${change} к прошлой неделе`));
  const button = visitButton("Разобрать точку", () => openStoreReason(store.name));
  button.setAttribute("aria-label", `Разобрать точку ${store.name}`);
  item.append(body, button);
  return item;
}

function renderRepReasons() {
  const points = stores.filter((store) => store.rep === reasonRep.value);
  const sales = points.reduce((sum, store) => sum + store.sales, 0);
  const target = points.reduce((sum, store) => sum + store.plan, 0);
  const below = points.filter((store) => store.sales < store.plan)
    .sort((a, b) => (b.plan - b.sales) - (a.plan - a.sales));
  const difference = sales - target;
  const summary = byId("rep-reason-summary");
  summary.replaceChildren(diagnosticKpi(showRatio(ratio(sales, target)), `${money(sales)} из ${money(target)}`, difference < 0 ? "negative" : "positive"));
  if (difference < 0 && below.length) {
    const largest = below[0];
    const explanation = salesReason(largest, ...weekOrders[largest.name]);
    summary.append(reasonCard(`Недобор по сотруднику — ${money(-difference)}. Наибольший разрыв в точке «${largest.name}» — ${money(largest.plan - largest.sales)}. ${explanation}`));
  } else {
    summary.append(makeElement("p", below.length ? "Общий план выполнен. Ниже показаны отдельные точки с недобором." : "План сотрудника выполнен по всем его точкам."));
  }
  byId("rep-reason-stores").replaceChildren(...below.map(shortfallRow));
}

function salesReason(store, previousOrders, currentOrders) {
  if (store.sales >= store.previous) {
    return store.sales < store.plan
      ? "Продажи выросли или остались на прежнем уровне, а выручка всё ещё ниже плана. По этим данным источник недобора требует проверки."
      : "Продажи не снизились, план выполнен.";
  }
  if (!previousOrders || !currentOrders) return "Выручка снизилась. Данных для сравнения среднего заказа недостаточно.";
  const ordersFell = currentOrders < previousOrders;
  const checkDifference = store.sales * previousOrders - store.previous * currentOrders;
  if (ordersFell && checkDifference === 0) return "Заказов стало меньше, а средняя сумма заказа осталась прежней.";
  if (ordersFell && checkDifference < 0) return "Снизились и число заказов, и средняя сумма заказа.";
  if (ordersFell) return "Заказов стало меньше. Рост средней суммы заказа не компенсировал их снижение.";
  return "Уменьшилась средняя сумма заказа.";
}

function renderStoreReasons() {
  const store = storeRecord(reasonStore.value);
  const [previousOrders, currentOrders] = weekOrders[store.name];
  const delta = store.previous ? (store.sales - store.previous) / store.previous : null;
  const summary = byId("reason-store-summary");
  const previousAverage = previousOrders ? money(Math.round(store.previous / previousOrders)) : "—";
  const currentAverage = currentOrders ? money(Math.round(store.sales / currentOrders)) : "—";
  summary.replaceChildren(diagnosticKpi(delta === null ? "—" : signed.format(delta), "Выручка к прошлой неделе", delta < 0 ? "negative" : ""));
  summary.append(
    makeElement("p", `Выручка ${money(store.previous)} → ${money(store.sales)} · План ${money(store.plan)}`),
    reasonCard(salesReason(store, previousOrders, currentOrders)),
    diagnosticList("Что видно в данных", [
      `Заказы: ${previousOrders} → ${currentOrders}. Средняя сумма заказа: ${previousAverage} → ${currentAverage}.`,
      store.visited ? "Запланированный визит состоялся." : "Запланированный визит представителя пропущен.",
      store.product ? "Товар был в наличии при последней проверке." : "При последней проверке товара не было.",
      store.freezer ? "Морозильник на месте по последней проверке." : "При последней проверке морозильник отсутствовал.",
    ]),
  );
  const actions = [];
  if (!store.product) actions.push("Проверить текущие остатки, даты поставок и когда товар исчез с полки.");
  if (!store.visited) actions.push("Уточнить причину пропуска и назначить повторный визит.");
  if (!store.freezer) actions.push("Уточнить, куда переместили морозильник и когда его вернут в точку.");
  if (store.freezer && store.sales < store.plan) actions.push("Проверить, работает ли морозильник, заполнен ли товаром и виден ли покупателям.");
  if ((store.sales < store.plan || store.sales < store.previous) && !actions.length) {
    actions.push("Сверить заказы, отмены и цены за обе недели, чтобы уточнить источник отклонения.");
  }
  if (actions.length) summary.append(diagnosticList("Что проверить в магазине", actions));
}

reasonRep.replaceChildren(...reps.map((name) => new Option(name, name)));
reasonStore.replaceChildren(...stores.map(({ name }) => new Option(name, name)));
reasonRep.addEventListener("change", renderRepReasons);
reasonStore.addEventListener("change", renderStoreReasons);
byId("open-store-reasons").addEventListener("click", () => openStoreReason(storeSelect.value));
const installedUnderPlan = stores.filter((store) => store.freezer && store.sales < store.plan);
byId("installed-under-plan").replaceChildren(...installedUnderPlan.map(shortfallRow));
renderRepReasons();
renderStoreReasons();

const meetingStorageKey = "lumen.manager-meetings.v1";
const meetingDialog = byId("meeting-dialog");
const meetingForm = byId("meeting-form");
const meetingStore = byId("meeting-store");
const meetingTopic = byId("meeting-topic");
const meetingTime = byId("meeting-time");

function loadManagerMeetings() {
  try {
    const saved = JSON.parse(localStorage.getItem(meetingStorageKey));
    if (Array.isArray(saved)) return saved;
  } catch {
    // Demo records stay available even when browser storage is blocked.
  }
  const now = Math.floor(Date.now() / 60000) * 60000;
  return [
    { id: "meeting-samal", store: "Самал", topic: "Проверка торгового оборудования", at: now - hour, status: "planned" },
    { id: "meeting-arman", store: "Арман", topic: "Разбор падения продаж с представителем", at: now + day, status: "planned" },
  ];
}

let managerMeetings = loadManagerMeetings();
let lastMeetingRender = 0;

function saveManagerMeetings() {
  try {
    localStorage.setItem(meetingStorageKey, JSON.stringify(managerMeetings));
    return true;
  } catch {
    return false;
  }
}

function markMeeting(id, status) {
  const meeting = managerMeetings.find((entry) => entry.id === id);
  if (activeRole !== "manager" || !meeting || meeting.at > Date.now() || meeting.status === status) return;
  meeting.status = status;
  meeting.markedAt = Date.now();
  const saved = saveManagerMeetings();
  addReport({
    rep: "Руководитель",
    title: status === "done" ? "Присутствовал на встрече" : "Не присутствовал на встрече",
    detail: `${meeting.store} · ${meeting.topic} · ${visitDate.format(meeting.at)}`,
  });
  const savedReport = saveTeamData();
  renderReports();
  renderManagerMeetings();
  setFeedback("meeting-feedback", saved && savedReport ? "Отметка сохранена и добавлена в отчёты." : "Отметка появилась в этой вкладке. Браузер не сохранил все изменения.");
}

function renderManagerMeetings() {
  const now = Date.now();
  lastMeetingRender = now;
  byId("manager-meetings").replaceChildren(...[...managerMeetings].sort((a, b) => a.at - b.at).map((meeting) => {
    const row = makeElement("article", undefined, "visit-row");
    const topic = makeElement("div");
    const time = makeElement("div");
    const actions = makeElement("div", undefined, "visit-actions");
    const labels = { planned: meeting.at <= now ? "Ожидает отметки" : "Запланирована", done: "Присутствовал", missed: "Не присутствовал" };
    const status = makeElement("span", labels[meeting.status], "visit-status");
    status.dataset.status = meeting.status === "planned" && meeting.at <= now ? "overdue" : meeting.status;
    topic.append(makeElement("strong", meeting.topic), makeElement("p", meeting.store, "visit-meta"));
    time.append(makeElement("p", visitDate.format(meeting.at)), status);
    if (meeting.markedAt) time.append(makeElement("p", `Отмечено ${visitDate.format(meeting.markedAt)}`, "visit-meta"));
    if (meeting.at <= now) {
      const present = visitButton("Я присутствовал", () => markMeeting(meeting.id, "done"));
      const absent = visitButton("Я не присутствовал", () => markMeeting(meeting.id, "missed"));
      present.disabled = meeting.status === "done";
      absent.disabled = meeting.status === "missed";
      actions.append(present, absent);
    }
    row.append(topic, time, actions);
    return row;
  }));
}

meetingStore.replaceChildren(...stores.map(({ name }) => new Option(name, name)));
byId("new-meeting").addEventListener("click", () => {
  meetingForm.reset();
  meetingTime.value = dateInputValue(Date.now());
  setFeedback("meeting-error", "");
  meetingDialog.showModal();
  meetingTopic.focus();
});
byId("cancel-meeting").addEventListener("click", () => meetingDialog.close());
meetingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const store = meetingStore.value;
  const topic = meetingTopic.value.trim();
  const at = Date.parse(`${meetingTime.value}:00+05:00`);
  if (activeRole !== "manager" || !storeRecord(store) || !topic || !Number.isFinite(at)) {
    setFeedback("meeting-error", "Укажите торговую точку, тему, дату и время встречи.");
    return;
  }
  if (managerMeetings.some((meeting) => meeting.at === at && meeting.status === "planned")) {
    setFeedback("meeting-error", "На это время у руководителя уже есть встреча.");
    return;
  }
  managerMeetings.push({ id: crypto.randomUUID(), store, topic, at, status: "planned" });
  const saved = saveManagerMeetings();
  meetingDialog.close();
  renderManagerMeetings();
  setFeedback("meeting-feedback", saved ? "Встреча добавлена." : "Встреча добавлена в этой вкладке. Браузер не сохранил изменения.");
});

window.addEventListener("storage", (event) => {
  if (event.key === meetingStorageKey) {
    managerMeetings = loadManagerMeetings();
    renderManagerMeetings();
  }
});
saveManagerMeetings();
renderManagerMeetings();
byId("manager-nav").querySelector('[aria-controls="meetings-view"]').addEventListener("click", renderManagerMeetings);
window.setInterval(() => {
  if (byId("meetings-view").hidden || activeRole !== "manager") return;
  const now = Date.now();
  if (managerMeetings.some(({ at, status }) => status === "planned" && at > lastMeetingRender && at <= now)) {
    renderManagerMeetings();
  }
}, 15000);
