"use strict";

// Each list runs from the oldest day to yesterday. The optional status and stock overrides are demo inspection records.
const freezerSamples = {
  "Арман": {
    visitors: [85, 94, 89, 92, 101, 97, 92],
    units: [9, 7, 8, 6, 0, 0, 0],
    price: 1500,
    conditions: { 4: "faulty", 5: "faulty", 6: "faulty" },
    emptyDays: [4, 5, 6],
  },
  "Мерей": {
    visitors: [110, 105, 112, 116, 122, 125, 119],
    units: [12, 11, 13, 12, 14, 13, 0],
    price: 1450,
    emptyDays: [6],
  },
  "Достык": {
    visitors: [75, 81, 76, 91, 85, 92, 87],
    units: [6, 8, 7, 10, 8, 9, 6],
    price: 1600,
  },
  "Самал": {
    visitors: [119, 116, 123, 129, 128, 134, 121],
    units: [0, 0, 0, 0, 0, 0, 0],
    price: 1500,
  },
  "Байтерек": {
    visitors: [50, 51, 58, 64, 57, 62, 54],
    units: [4, 4, 6, 5, 6, 0, 0],
    price: 1350,
    conditions: { 5: "off", 6: "off" },
    emptyDays: [5, 6],
  },
  "Арай": {
    visitors: [52, 53, 55, 63, 58, 64, 8],
    units: [5, 5, 5, 8, 6, 7, 0],
    price: 1400,
  },
};

const freezerLabels = { working: "Исправен", faulty: "Неисправен", off: "Отключён", missing: "Не установлен" };
const freezerDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const freezerDayName = (iso) => freezerDateFormatter.format(new Date(`${iso}T12:00:00Z`));
const freezerNow = Date.now();
const freezerDays = Array.from({ length: 7 }, (_, index) => dateInputValue(freezerNow - (7 - index) * day).slice(0, 10));
const freezerStore = byId("freezer-store");
const freezerDay = byId("freezer-day");

function freezerRecord(store, index) {
  const sample = freezerSamples[store.name];
  const units = sample.units[index];
  return {
    date: freezerDays[index],
    visitors: sample.visitors[index],
    units,
    sales: units * sample.price,
    condition: store.freezer ? sample.conditions?.[index] ?? "working" : "missing",
    hasStock: store.freezer ? !sample.emptyDays?.includes(index) : null,
  };
}

function trafficDrop(record, earlierDays) {
  if (!earlierDays.length) return null;
  const usual = Math.round(earlierDays.reduce((sum, entry) => sum + entry.visitors, 0) / earlierDays.length);
  return usual > 0 && record.visitors <= usual / 2 ? usual : null;
}

function freezerDiagnosis(record, usualTraffic) {
  if (record.condition === "missing") return "По данным проверки ларь в точке не установлен.";
  if (record.units > 0) return "За выбранный день есть продажи товаров из ларя.";
  if (record.condition === "faulty") return "Вероятная причина — неисправность ларя. При проверке компрессор не запустился, товар в ларе отсутствовал.";
  if (record.condition === "off") return "Ларь был отключён, товара в нём не было. Нужно выяснить причину отключения.";
  if (!record.hasStock) return "Ларь исправен, но товар отсутствовал. Из пустого ларя продавать было нечего.";
  if (record.visitors === 0) return "Посещений за день не зафиксировано. Нужно проверить часы работы и учёт посетителей.";
  if (usualTraffic !== null) return `Ларь исправен и товар был в наличии. За день зашло ${record.visitors} человек при среднем ${usualTraffic} за предыдущие дни. Низкая посещаемость могла повлиять на продажи.`;
  return "Ларь исправен, товар есть. Чтобы выяснить причину нулевых продаж, нужно проверить выкладку, ценники и спрос на ассортимент.";
}

function freezerActions(record, usualTraffic) {
  if (record.condition === "missing") return ["Уточнить статус установки у руководителя и сверить учёт оборудования."];
  if (record.condition === "faulty") return ["Передать заявку технику. После ремонта проверить работу ларя и возобновить выкладку товара."];
  if (record.condition === "off") return ["Уточнить причину отключения и передать заявку ответственному за оборудование."];
  if (!record.hasStock) return ["Проверить остатки и согласовать пополнение с торговым представителем."];
  if (record.units > 0) return [];
  if (usualTraffic !== null || record.visitors === 0) return ["Сверить часы работы и подсчёт посетителей, сравнить трафик в такие же дни."];
  return ["Проверить, видят ли покупатели ларь, ценники и доступный ассортимент."];
}

function freezerStockLabel(record) {
  if (record.hasStock === null) return "—";
  return record.hasStock ? "В наличии" : "Отсутствовал";
}

function renderFreezerShortlist(index) {
  const zeroStores = stores.filter((store) => store.freezer && freezerRecord(store, index).units === 0);
  byId("freezer-zero-empty").hidden = Boolean(zeroStores.length);
  byId("freezer-zero-sales").replaceChildren(...zeroStores.map((store) => {
    const record = freezerRecord(store, index);
    const item = makeElement("li");
    const body = makeElement("div");
    body.append(makeElement("strong", store.name), makeElement("p", `${freezerLabels[record.condition]} · Посетителей: ${integer.format(record.visitors)}`));
    const button = visitButton("Разобрать", () => {
      freezerStore.value = store.name;
      renderFreezerView();
      freezerStore.focus({ preventScroll: true });
    });
    button.setAttribute("aria-label", `Разобрать ларь в точке ${store.name}`);
    item.append(body, button);
    return item;
  }));
}

function renderFreezerView() {
  const store = storeRecord(freezerStore.value);
  const selectedIndex = freezerDays.indexOf(freezerDay.value);
  const history = freezerDays.map((_, index) => freezerRecord(store, index));
  const record = history[selectedIndex];
  const typical = trafficDrop(record, history.slice(0, selectedIndex));
  fillMonthlyMetrics("freezer-metrics", [
    ["Посетители за день", integer.format(record.visitors), store.city],
    ["Продано из ларя", `${integer.format(record.units)} шт.`, freezerDayName(record.date)],
    ["Выручка из ларя", money(record.sales)],
    ["Состояние ларя", freezerLabels[record.condition], `Товар · ${freezerStockLabel(record)}`],
  ]);

  const diagnosis = byId("freezer-reason");
  diagnosis.replaceChildren(reasonCard(freezerDiagnosis(record, typical)));
  const actions = freezerActions(record, typical);
  if (actions.length) diagnosis.append(diagnosticList("Что проверить", actions));

  byId("freezer-history").replaceChildren(...[...history].reverse().map((entry) => {
    const row = reportRow([freezerDayName(entry.date), integer.format(entry.visitors), integer.format(entry.units),
      money(entry.sales), freezerLabels[entry.condition], freezerStockLabel(entry)]);
    if (entry.date === record.date) row.classList.add("selected-freezer-day");
    return row;
  }));
  renderFreezerShortlist(selectedIndex);
}

freezerStore.replaceChildren(...stores.map(({ name }) => new Option(name, name)));
freezerDay.replaceChildren(...[...freezerDays].reverse().map((iso) => new Option(freezerDayName(iso), iso)));
freezerStore.addEventListener("change", renderFreezerView);
freezerDay.addEventListener("change", renderFreezerView);
byId("open-freezer-diagnostics").addEventListener("click", () => {
  freezerStore.value = reasonStore.value;
  renderFreezerView();
  showView("freezers-view");
  byId("freezers-heading").scrollIntoView({ block: "start" });
});
renderFreezerView();
