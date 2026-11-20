from pathlib import Path
from typing import NamedTuple

import altair as alt
import streamlit as st


class StoreCheck(NamedTuple):
    visited: bool
    product_available: bool
    freezer_available: bool


def sales_alerts(previous: int, current: int, plan: int) -> list[str]:
    alerts = []
    if previous > 0 and current * 100 <= previous * 70:
        alerts.append("Падение продаж на 30% или больше")
    if current < plan:
        alerts.append("План не выполнен")
    return alerts


def format_tenge(amount: int) -> str:
    return f"{amount:_}".replace("_", " ") + " ₸"


def format_percent(ratio: float, *, signed: bool = False) -> str:
    formatted = f"{ratio:+.1%}" if signed else f"{ratio:.1%}"
    return formatted.replace(".", ",")


def style_chart(chart):
    return (
        chart.properties(background="transparent", height=176)
        .configure_view(stroke=None)
        .configure_axis(
            labelColor="#a8b0cc",
            labelFontSize=11,
            labelPadding=7,
            gridColor="#29314a",
            domain=False,
            ticks=False,
        )
    )


def weekly_chart(previous: int, current: int):
    periods = ["Прошлая неделя", "Текущая неделя"]
    points = [
        {"period": period, "sales": sales, "label": format_tenge(sales)}
        for period, sales in zip(periods, (previous, current), strict=True)
    ]
    base = alt.Chart(alt.Data(values=points)).encode(
        x=alt.X("period:N", sort=periods, title=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y(
            "sales:Q",
            title=None,
            axis=alt.Axis(tickCount=4, labelExpr="datum.value / 1000 + ' тыс.'"),
        ),
        tooltip=[alt.Tooltip("period:N", title="Период"), alt.Tooltip("label:N", title="Продажи")],
    )
    fill = alt.Gradient(
        gradient="linear", x1=0, x2=0, y1=0, y2=1,
        stops=[alt.GradientStop(offset=0, color="#8d6af080"), alt.GradientStop(offset=1, color="#8d6af008")],
    )
    area = base.mark_area(color=fill)
    line = base.mark_line(
        color="#b197ff", strokeWidth=3,
        point=alt.OverlayMarkDef(color="#b197ff", filled=True, size=80),
    )
    return style_chart(area + line)


def store_chart(stores: list[dict]):
    points = [
        {
            "store": store["Торговая точка"],
            "sales": store["Текущая неделя"],
            "label": format_tenge(store["Текущая неделя"]),
            "below_plan": store["Текущая неделя"] < store["План"],
        }
        for store in stores
    ]
    chart = alt.Chart(alt.Data(values=points)).mark_bar(cornerRadiusEnd=5, size=13).encode(
        x=alt.X("sales:Q", title=None, axis=alt.Axis(tickCount=3, labelExpr="datum.value / 1000 + ' тыс.'")),
        y=alt.Y("store:N", sort="-x", title=None),
        color=alt.condition("datum.below_plan", alt.value("#f4a5c8"), alt.value("#9f84f7")),
        tooltip=[alt.Tooltip("store:N", title="Магазин"), alt.Tooltip("label:N", title="Продажи")],
    )
    return style_chart(chart)


st.set_page_config(page_title="TradeControl AI", layout="wide", initial_sidebar_state="collapsed")
st.html(Path(__file__).with_name("dashboard.css"))

columns = ("Торговая точка", "Представитель", "Прошлая неделя", "Текущая неделя", "План")
demo_sales = [
    ("Арман", "Айдана", 100_000, 70_000, 100_000),
    ("Мерей", "Айдана", 85_000, 92_000, 90_000),
    ("Достык", "Данияр", 76_000, 80_000, 79_000),
    ("Самал", "Данияр", 102_000, 104_000, 100_000),
    ("Байтерек", "Алия", 56_000, 58_000, 55_000),
    ("Арай", "Алия", 61_000, 65_000, 64_000),
]
stores = [dict(zip(columns, row, strict=True)) for row in demo_sales]
store_checks = {
    "Арман": StoreCheck(False, False, True),
    "Мерей": StoreCheck(True, True, True),
    "Достык": StoreCheck(True, True, True),
    "Самал": StoreCheck(True, True, False),
    "Байтерек": StoreCheck(True, True, True),
    "Арай": StoreCheck(True, True, True),
}

stores_by_name = {store["Торговая точка"]: store for store in stores}
flagged_names = set()
for name, store in stores_by_name.items():
    findings = sales_alerts(store["Прошлая неделя"], store["Текущая неделя"], store["План"])
    check = store_checks[name]
    if not check.visited:
        findings.append("Пропущен визит")
    if not check.product_available:
        findings.append("Нет товара")
    if not check.freezer_available:
        findings.append("Нет морозильника")

    store["Статус"] = " · ".join(findings) if findings else "Без отклонений"
    if findings:
        flagged_names.add(name)


def show_overview(visible_stores: list[dict]) -> None:
    previous = sum(store["Прошлая неделя"] for store in visible_stores)
    current = sum(store["Текущая неделя"] for store in visible_stores)
    target = sum(store["План"] for store in visible_stores)
    flagged = sum(store["Торговая точка"] in flagged_names for store in visible_stores)

    sales, plan, alerts = st.columns(3, gap="small")
    sales.metric(
        "Продажи за неделю",
        format_tenge(current),
        f"{format_percent(current / previous - 1, signed=True)} за неделю" if previous else None,
        border=True,
    )
    plan.metric("Выполнение плана", format_percent(current / target) if target else "—", border=True)
    alerts.metric("Точки с отклонениями", f"{flagged} из {len(visible_stores)}", border=True)

    trend, ranking = st.columns(2, gap="small")
    with trend.container(border=True, key="weekly-chart"):
        st.markdown("### Динамика продаж")
        st.altair_chart(weekly_chart(previous, current), theme=None, width="stretch")
    with ranking.container(border=True, key="store-chart"):
        st.markdown("### Продажи по магазинам")
        st.altair_chart(store_chart(visible_stores), theme=None, width="stretch")

    with st.container(border=True, key="store-table"):
        st.markdown("### Торговые точки")
        table_rows = sorted(visible_stores, key=lambda store: store["Торговая точка"] not in flagged_names)
        money_columns = {
            column: st.column_config.NumberColumn(format="localized")
            for column in ("Прошлая неделя", "Текущая неделя", "План")
        }
        st.dataframe(table_rows, hide_index=True, width="stretch", column_config=money_columns)


def show_store(selected: dict) -> None:
    check = store_checks[selected["Торговая точка"]]
    previous = selected["Прошлая неделя"]
    current = selected["Текущая неделя"]
    target = selected["План"]
    change = format_percent(current / previous - 1, signed=True) if previous else ""
    change_class = "tc-negative" if current < previous else ""
    target_label = format_percent(current / target) if target else "—"
    st.caption(f"Представитель · {selected['Представитель']}")
    st.html(f"""
        <div class="tc-detail-sales">
            <strong>{format_tenge(current)}</strong>
            <span class="{change_class}">{change}</span>
        </div>
        <p class="tc-detail-context">Прошлая неделя · {format_tenge(previous)}</p>
        <p class="tc-detail-context">Выполнение плана · {target_label}</p>
    """)

    checks = (
        ("Визит за неделю", check.visited, "Состоялся", "Пропущен"),
        ("Товар", check.product_available, "В наличии", "Отсутствует"),
        ("Морозильник", check.freezer_available, "На месте", "Отсутствует"),
    )
    rows = [
        f'<div><dt>{label}</dt><dd class="{"" if passed else "tc-warning"}">{yes if passed else no}</dd></div>'
        for label, passed, yes, no in checks
    ]
    st.html('<dl class="tc-checks">' + "".join(rows) + "</dl>")
    st.caption("Товар и морозильник · по последней проверке")

    st.markdown("**Что проверить**")
    actions = []
    if not check.visited:
        actions.append("Уточнить причину пропуска у представителя и назначить повторный визит.")
    if not check.product_available:
        actions.append("Уточнить остатки и согласовать пополнение.")
    if not check.freezer_available:
        actions.append("Уточнить, где находится морозильник, и согласовать его размещение в точке.")
    if sales_alerts(previous, current, target):
        actions.append("Сверить продажи и заказы, чтобы выяснить причину отклонения.")

    if actions:
        st.markdown("\n".join(f"- {action}" for action in actions))
    else:
        st.success("По данным за неделю действий не требуется.")


st.html("""
    <header class="tc-header">
        <span class="tc-mark" aria-hidden="true">TC</span>
        <div>
            <h1>TradeControl AI</h1>
            <p>Дашборд отдела продаж</p>
        </div>
        <span class="tc-demo">Демонстрационные данные</span>
    </header>
""")

with st.container(key="workspace"):
    overview, details = st.columns([2.7, 1], gap="medium")
    with overview.container(key="overview"):
        heading, filter_panel = st.columns([1.5, 1], vertical_alignment="bottom")
        with heading:
            st.html('<section class="tc-overview"><h2>Обзор продаж</h2><p>Текущая и прошлая недели</p></section>')
        representatives = sorted({store["Представитель"] for store in stores})
        representative = filter_panel.selectbox("Торговый представитель", ["Все", *representatives])
        visible_stores = [
            store for store in stores if representative == "Все" or store["Представитель"] == representative
        ]
        show_overview(visible_stores)

    with details.container(border=True, key="store-detail"):
        st.html('<div class="tc-detail-heading"><span class="tc-detail-icon" aria-hidden="true">✦</span><h2>Разбор магазина</h2></div>')
        selected_name = st.selectbox("Торговая точка", [store["Торговая точка"] for store in visible_stores])
        show_store(stores_by_name[selected_name])
