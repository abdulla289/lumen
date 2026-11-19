"use strict";

const stores = [
  { name: "Арман", city: "Актобе", rep: "Айдана", previous: 100000, sales: 70000, plan: 100000, visited: false, product: false, freezer: true },
  { name: "Мерей", city: "Актобе", rep: "Айдана", previous: 85000, sales: 59500, plan: 90000, visited: true, product: true, freezer: true },
  { name: "Достык", city: "Актобе", rep: "Данияр", previous: 76000, sales: 80000, plan: 160000, visited: true, product: true, freezer: true },
  { name: "Самал", city: "Актобе", rep: "Данияр", previous: 102000, sales: 104000, plan: 208000, visited: true, product: true, freezer: false },
  { name: "Байтерек", city: "Актобе", rep: "Алия", previous: 56000, sales: 58000, plan: 55000, visited: true, product: true, freezer: true },
  { name: "Арай", city: "Актобе", rep: "Алия", previous: 61000, sales: 65000, plan: 64000, visited: true, product: true, freezer: true },
];

const checks = [
  { key: "visited", label: "Визит за неделю", yes: "Состоялся", no: "Пропущен", alert: "Пропущен визит", action: "Уточнить причину пропуска у представителя и назначить повторный визит." },
  { key: "product", label: "Товар", yes: "В наличии", no: "Отсутствует", alert: "Нет товара", action: "Уточнить остатки и согласовать пополнение." },
  { key: "freezer", label: "Морозильник", yes: "На месте", no: "Отсутствует", alert: "Нет морозильника", action: "Уточнить, где находится морозильник, и согласовать его размещение в точке." },
];

const integer = new Intl.NumberFormat("ru-RU");
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const money = (amount) => `${integer.format(amount)} ₸`;
const byId = (id) => document.getElementById(id);
const representative = byId("representative");
const storeSelect = byId("store");

function weeklyRepTotals(name) {
  return stores.filter(({ rep }) => rep === name).reduce((totals, store) => ({
    previous: totals.previous + store.previous,
    sales: totals.sales + store.sales,
    plan: totals.plan + store.plan,
  }), { previous: 0, sales: 0, plan: 0 });
}

function makeElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function salesAlerts(store) {
  const alerts = [];
  if (store.previous > 0 && store.sales * 100 <= store.previous * 70) alerts.push("Падение продаж на 30% или больше");
  if (store.sales < store.plan) alerts.push("План не выполнен");
  return alerts;
}

function findings(store) {
  return [...salesAlerts(store), ...checks.filter(({ key }) => !store[key]).map(({ alert }) => alert)];
}

function setChange(element, previous, current, context = "") {
  const change = previous ? (current - previous) / previous : null;
  element.textContent = change === null ? "—" : `${signed.format(change)}${context}`;
  element.className = change < 0 ? "negative" : change > 0 ? "positive" : "";
}

function showBars(container, points) {
  const maximum = Math.max(1, ...points.map(({ value }) => value));
  const rows = points.map(({ name, value, warning }) => {
    const row = makeElement("div", undefined, "bar-row");
    const track = makeElement("span", undefined, "bar-track");
    track.setAttribute("aria-hidden", "true");
    const fill = makeElement("span", undefined, warning ? "bar-fill warning" : "bar-fill");
    fill.style.width = `${100 * value / maximum}%`;
    track.append(fill);
    row.append(makeElement("span", name), track, makeElement("span", money(value)));
    return row;
  });
  container.replaceChildren(...rows);
}

function showStore() {
  const store = stores.find(({ name }) => name === storeSelect.value);
  byId("store-city").textContent = `Город · ${store.city}`;
  byId("store-representative").textContent = `Представитель · ${store.rep}`;
  byId("store-sales").textContent = money(store.sales);
  setChange(byId("store-change"), store.previous, store.sales);
  byId("store-previous").textContent = `Прошлая неделя · ${money(store.previous)}`;
  byId("store-plan").textContent = `Выполнение плана · ${store.plan ? percent.format(store.sales / store.plan) : "—"}`;

  const checkList = byId("checks");
  checkList.className = "checks";
  checkList.replaceChildren(...checks.map(({ key, label, yes, no }) => {
    const row = makeElement("div");
    row.append(makeElement("dt", label), makeElement("dd", store[key] ? yes : no, store[key] ? "" : "warning"));
    return row;
  }));

  const actions = checks.filter(({ key }) => !store[key]).map(({ action }) => action);
  if (salesAlerts(store).length) actions.push("Сверить продажи и заказы, чтобы выяснить причину отклонения.");
  byId("actions").replaceChildren(...actions.map((action) => makeElement("li", action)));
  byId("no-actions").hidden = actions.length > 0;
}

function showOverview() {
  const visible = stores.filter(({ rep }) => !representative.value || rep === representative.value);
  const previous = visible.reduce((total, store) => total + store.previous, 0);
  const current = visible.reduce((total, store) => total + store.sales, 0);
  const plan = visible.reduce((total, store) => total + store.plan, 0);
  const rows = visible.map((store) => ({ store, alerts: findings(store) }));
  const flagged = rows.filter(({ alerts }) => alerts.length).length;

  byId("total-sales").textContent = money(current);
  byId("plan").textContent = plan ? percent.format(current / plan) : "—";
  byId("alerts").textContent = `${flagged} из ${visible.length}`;
  setChange(byId("change"), previous, current, " за неделю");

  showBars(byId("weekly-chart"), [
    { name: "Прошлая", value: previous }, { name: "Текущая", value: current },
  ]);
  showBars(byId("store-chart"), [...visible].sort((a, b) => b.sales - a.sales).map((store) => ({
    name: store.name, value: store.sales, warning: store.sales < store.plan,
  })));

  rows.sort((a, b) => Number(Boolean(b.alerts.length)) - Number(Boolean(a.alerts.length)));
  byId("stores").replaceChildren(...rows.map(({ store, alerts }) => {
    const row = makeElement("tr");
    for (const value of [store.name, store.city, store.rep, money(store.previous), money(store.sales), money(store.plan)]) {
      row.append(makeElement("td", value));
    }
    row.append(makeElement("td", alerts.join(" · ") || "Без отклонений", alerts.length ? "negative" : ""));
    return row;
  }));

  const previousSelection = storeSelect.value;
  storeSelect.replaceChildren(...visible.map(({ name }) => new Option(name, name)));
  if (visible.some(({ name }) => name === previousSelection)) storeSelect.value = previousSelection;
  showStore();
}

const reps = [...new Set(stores.map(({ rep }) => rep))].sort((a, b) => a.localeCompare(b, "ru"));
representative.replaceChildren(new Option("Все", ""), ...reps.map((rep) => new Option(rep, rep)));
representative.addEventListener("change", showOverview);
storeSelect.addEventListener("change", showStore);
showOverview();
