"use strict";

// Archived activity and sales samples for the demo. This month uses the live demo visit and task records.
const monthlyProfiles = {
  "Арман": { weeklyOrders: 18, visitsDone: 3, visitsMissed: 2, tasksDone: 2, tasksDue: 4 },
  "Мерей": { weeklyOrders: 26, visitsDone: 5, visitsMissed: 0, tasksDone: 4, tasksDue: 4 },
  "Достык": { weeklyOrders: 22, visitsDone: 4, visitsMissed: 1, tasksDone: 3, tasksDue: 4 },
  "Самал": { weeklyOrders: 20, visitsDone: 5, visitsMissed: 0, tasksDone: 3, tasksDue: 3 },
  "Байтерек": { weeklyOrders: 14, visitsDone: 4, visitsMissed: 1, tasksDone: 4, tasksDue: 4 },
  "Арай": { weeklyOrders: 24, visitsDone: 4, visitsMissed: 1, tasksDone: 3, tasksDue: 5 },
};
const demoStoreCosts = {
  "Арман": { costRate: 0.74, weeklyOperatingCosts: 15000 },
  "Мерей": { costRate: 0.72, weeklyOperatingCosts: 14000 },
  "Достык": { costRate: 0.70, weeklyOperatingCosts: 13000 },
  "Самал": { costRate: 0.76, weeklyOperatingCosts: 16000 },
  "Байтерек": { costRate: 0.68, weeklyOperatingCosts: 10000 },
  "Арай": { costRate: 0.72, weeklyOperatingCosts: 12000 },
};
const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const isoDay = dateInputValue(Date.now()).slice(0, 10);
const [demoYear, demoMonth, demoDay] = isoDay.split("-").map(Number);
const endOfDemoDay = Date.parse(`${isoDay}T23:59:59+05:00`);

function makeMonth(year, monthIndex, through, current) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days = through ?? lastDay;
  const segments = [];
  for (let first = 1; first <= days; first += 7) {
    const last = Math.min(first + 6, days);
    segments.push({ label: first === last ? String(first) : `${first}–${last}`, days: last - first + 1 });
  }
  return {
    key: start.toISOString().slice(0, 7), label: monthFormatter.format(start), days, current, segments,
  };
}

const monthlyPeriods = [makeMonth(demoYear, demoMonth - 2, null, false), makeMonth(demoYear, demoMonth - 1, demoDay, true)];
const monthlySelectors = ["network-month", "employee-month", "staff-month"].map(byId);
const selectedPeriod = (id) => monthlyPeriods.find(({ key }) => key === byId(id).value);
const ratio = (value, total) => total ? value / total : null;
const showRatio = (value) => value === null ? "—" : percent.format(value);

function monthlyActivity(store, period) {
  if (!period.current) return monthlyProfiles[store.name];
  const inMonth = (timestamp) => dateInputValue(timestamp).startsWith(period.key);
  const storeVisits = visits.filter((visit) => visit.store === store.name && inMonth(visit.at));
  const dueTasks = team.tasks.filter((task) => task.store === store.name && inMonth(task.due) && task.due <= endOfDemoDay);
  return {
    visitsDone: storeVisits.filter(({ status }) => status === "done").length,
    visitsMissed: storeVisits.filter(({ status }) => status === "missed").length,
    tasksDone: dueTasks.filter(({ done }) => done).length,
    tasksDue: dueTasks.length,
  };
}

function monthStore(store, period) {
  const baseOrders = monthlyProfiles[store.name].weeklyOrders;
  const { costRate, weeklyOperatingCosts } = demoStoreCosts[store.name];
  const factors = [0.89, 1.02, 0.97, 1.08, 1.04];
  const segments = period.segments.map((segment, index) => {
    const fraction = segment.days / 7;
    const factor = factors[index];
    const weeklySales = period.current ? store.sales : store.previous;
    const sales = Math.round(weeklySales * factor * fraction);
    return {
      sales,
      orders: Math.round(baseOrders * factor * fraction),
      plan: Math.round(store.plan * fraction),
      costOfGoods: Math.round(sales * costRate),
      operatingCosts: Math.round(weeklyOperatingCosts * fraction),
    };
  });
  const totals = segments.reduce((sum, part) => ({
    sales: sum.sales + part.sales, orders: sum.orders + part.orders, plan: sum.plan + part.plan,
    costOfGoods: sum.costOfGoods + part.costOfGoods, operatingCosts: sum.operatingCosts + part.operatingCosts,
  }), { sales: 0, orders: 0, plan: 0, costOfGoods: 0, operatingCosts: 0 });
  const { visitsDone, visitsMissed, tasksDone, tasksDue } = monthlyActivity(store, period);
  return { name: store.name, rep: store.rep, segments, ...totals, visitsDone, visitsMissed, tasksDone, tasksDue };
}

function monthTotals(rows) {
  const totals = { sales: 0, orders: 0, plan: 0, costOfGoods: 0, operatingCosts: 0, visitsDone: 0, visitsMissed: 0, tasksDone: 0, tasksDue: 0 };
  for (const row of rows) {
    for (const key of Object.keys(totals)) totals[key] += row[key];
  }
  const components = [
    [0.5, ratio(Math.min(totals.sales, totals.plan), totals.plan)],
    [0.3, ratio(totals.visitsDone, totals.visitsDone + totals.visitsMissed)],
    [0.2, ratio(totals.tasksDone, totals.tasksDue)],
  ].filter(([, value]) => value !== null);
  const score = ratio(components.reduce((sum, [weight, value]) => sum + weight * value, 0),
    components.reduce((sum, [weight]) => sum + weight, 0));
  return { ...totals, score };
}

function operatingProfit(totals) {
  return totals.sales - totals.costOfGoods - totals.operatingCosts;
}

function rankStores(rows) {
  return [...rows].sort((a, b) => b.orders - a.orders || b.sales - a.sales || a.name.localeCompare(b.name, "ru"));
}

function periodNote(period) {
  return period.current
    ? `${period.label} · с 1 по ${period.days}-е число · план на прошедшие дни · демоданные`
    : `${period.label} · полный месяц · демоданные`;
}

function fillMonthlyMetrics(id, values) {
  byId(id).replaceChildren(...values.map(([label, value, hint]) => {
    const card = makeElement("section", undefined, "card");
    card.append(makeElement("h3", label), makeElement("strong", value));
    if (hint) card.append(makeElement("p", hint));
    return card;
  }));
}

function storeMonthRow(row, networkView = false) {
  const tableRow = reportRow([row.name, ...(networkView ? [row.rep] : []), integer.format(row.orders), money(row.sales),
    money(row.plan), showRatio(ratio(row.sales, row.plan)), row.orders ? money(Math.round(row.sales / row.orders)) : "—",
    ...(networkView ? [row.visitsDone, row.visitsMissed] : [])]);
  if (networkView) {
    const profit = operatingProfit(row);
    tableRow.append(makeElement("td", money(profit), profit < 0 ? "profit-loss" : ""));
  }
  return tableRow;
}

function renderProfitBreakdown(totals) {
  const profit = operatingProfit(totals);
  const amounts = [
    ["Выручка", money(totals.sales)],
    ["Себестоимость товаров", money(totals.costOfGoods)],
    ["Валовая прибыль", money(totals.sales - totals.costOfGoods)],
    ["Операционные расходы", money(totals.operatingCosts)],
    ["Операционная прибыль", money(profit)],
    ["Доля прибыли в выручке", showRatio(ratio(profit, totals.sales))],
  ];
  byId("network-profit-breakdown").replaceChildren(...amounts.map(([label, value], index) => {
    const row = makeElement("div", undefined, index >= 4 && profit < 0 ? "profit-loss" : "");
    row.append(makeElement("dt", label), makeElement("dd", value));
    return row;
  }));
}

function renderNetworkMonth() {
  const period = selectedPeriod("network-month");
  const rows = rankStores(stores.map((store) => monthStore(store, period)));
  const stats = monthTotals(rows);
  const trendStore = byId("month-trend-store").value;
  const trendRows = trendStore ? rows.filter(({ name }) => name === trendStore) : rows;
  byId("monthly-period-note").textContent = periodNote(period);
  fillMonthlyMetrics("network-month-metrics", [
    ["Выручка", money(stats.sales), `План ${money(stats.plan)}`],
    ["Общая прибыль", money(operatingProfit(stats)), "Операционная · все точки"],
    ["Выполнение плана", showRatio(ratio(stats.sales, stats.plan)), `Точек: ${rows.length}`],
    ["Заказы", integer.format(stats.orders)],
    ["Средний заказ", stats.orders ? money(Math.round(stats.sales / stats.orders)) : "—"],
    ["Визиты состоялись", stats.visitsDone, `Пропущено: ${stats.visitsMissed}`],
  ]);
  renderProfitBreakdown(stats);
  showBars(byId("network-month-chart"), period.segments.map((segment, index) => ({
    name: segment.label, value: trendRows.reduce((total, row) => total + row.segments[index].sales, 0),
  })));
  byId("month-order-leaders").replaceChildren(...rows.slice(0, 3).map((row) => {
    const item = makeElement("li");
    const content = makeElement("div");
    content.append(makeElement("span", row.name), makeElement("strong", integer.format(row.orders)));
    item.append(content);
    return item;
  }));
  byId("network-month-stores").replaceChildren(...rows.map((row) => storeMonthRow(row, true)));
}

function renderMonthlyProfile(rows, metricsId, tableId) {
  const stats = monthTotals(rows);
  fillMonthlyMetrics(metricsId, [
    ["Эффективность", showRatio(stats.score)],
    ["Выручка", money(stats.sales), `План ${money(stats.plan)}`],
    ["Выполнение плана", showRatio(ratio(stats.sales, stats.plan))],
    ["Заказы", integer.format(stats.orders), stats.orders ? `Средний ${money(Math.round(stats.sales / stats.orders))}` : ""],
    ["Визиты состоялись", stats.visitsDone, `Пропущено: ${stats.visitsMissed}`],
    ["Задачи выполнены", `${stats.tasksDone} из ${stats.tasksDue}`, "Задачи со сроком до конца периода"],
  ]);
  byId(tableId).replaceChildren(...rankStores(rows).map((row) => storeMonthRow(row)));
}

function renderEmployeeMonth() {
  const period = selectedPeriod("employee-month");
  const monthlyStores = stores.map((store) => monthStore(store, period));
  const employees = reps.map((name) => ({ name, stats: monthTotals(monthlyStores.filter(({ rep }) => rep === name)) }))
    .sort((a, b) => (b.stats.score ?? -1) - (a.stats.score ?? -1));
  byId("employee-period-note").textContent = periodNote(period);
  byId("employee-month-comparison").replaceChildren(...employees.map(({ name, stats }) => reportRow([
    name, showRatio(stats.score), integer.format(stats.orders), money(stats.sales), showRatio(ratio(stats.sales, stats.plan)),
    `${stats.visitsDone} из ${stats.visitsDone + stats.visitsMissed}`, `${stats.tasksDone} из ${stats.tasksDue}`,
  ])));
  renderMonthlyProfile(monthlyStores.filter(({ rep }) => rep === byId("employee-person").value), "employee-month-metrics", "employee-month-stores");
}

function renderStaffMonth() {
  const period = selectedPeriod("staff-month");
  const rows = stores.filter(({ rep }) => rep === staffName.value).map((store) => monthStore(store, period));
  byId("staff-period-note").textContent = periodNote(period);
  renderMonthlyProfile(rows, "staff-month-metrics", "staff-month-stores");
}

for (const selector of monthlySelectors) {
  selector.replaceChildren(...monthlyPeriods.map(({ label, key }) => new Option(label, key)));
}
byId("month-trend-store").replaceChildren(new Option("Все точки", ""), ...stores.map(({ name }) => new Option(name, name)));
byId("employee-person").replaceChildren(...reps.map((rep) => new Option(rep, rep)));
for (const [id, callback] of [
  ["network-month", renderNetworkMonth], ["month-trend-store", renderNetworkMonth],
  ["employee-month", renderEmployeeMonth], ["employee-person", renderEmployeeMonth], ["staff-month", renderStaffMonth],
]) {
  byId(id).addEventListener("change", callback);
}
window.addEventListener("tradecontrol:team-rendered", () => {
  renderNetworkMonth();
  renderEmployeeMonth();
  renderStaffMonth();
});
renderNetworkMonth();
renderEmployeeMonth();
renderStaffMonth();
