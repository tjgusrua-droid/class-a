#!/usr/bin/env python3
"""daily.csv 를 평일/주말/공휴일로 나눠 일평균 관객수를 계산하고 HTML 차트를 만든다.

사용법:
    python3 analyze.py                       # daily.csv -> report.html
    python3 analyze.py --metric sales_top10  # 관객수 대신 매출액 기준
"""
import argparse, csv, os, statistics
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
WD = ["월", "화", "수", "목", "금", "토", "일"]


def load_holidays(path):
    hol = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(None, 1)
            hol[parts[0]] = parts[1] if len(parts) > 1 else "공휴일"
    return hol


def classify(d, holidays):
    """공휴일이 주말보다 우선. 즉 '토요일인 추석'은 공휴일로만 센다."""
    if d.isoformat() in holidays:
        return "공휴일"
    return "주말" if d.weekday() >= 5 else "평일"


def fmt(n):
    return format(int(round(n)), ",")


def bar_path(x, y, w, h, r=4):
    """윗변만 둥근 막대. 바닥은 축에 딱 붙는다."""
    r = min(r, w / 2, h)
    return ("M%.2f %.2f V%.2f Q%.2f %.2f %.2f %.2f H%.2f Q%.2f %.2f %.2f %.2f V%.2f Z"
            % (x, y + h, y + r, x, y, x + r, y, x + w - r, x + w, y, x + w, y + r, y + h))


def vbar_chart(items, width=900, height=300, pad_l=76, pad_b=44, pad_t=16):
    """items: [(label, value, tooltip_html, color_role)] -> SVG 문자열"""
    if not items:
        return "<p class='empty'>해당 구간에 데이터가 없습니다.</p>"
    plot_w = width - pad_l - 16
    plot_h = height - pad_t - pad_b
    vmax = max(v for _, v, _, _ in items) or 1
    # 눈금: 위로 넉넉하게 반올림
    step = 10 ** (len(str(int(vmax))) - 1)
    top = (int(vmax / step) + 1) * step
    n = len(items)
    slot = plot_w / n
    bw = min(slot - 14, 78)

    out = ['<svg viewBox="0 0 %d %d" role="img" class="chart">' % (width, height)]
    # 그리드 + y축 라벨
    for i in range(5):
        v = top * i / 4
        y = pad_t + plot_h - plot_h * (v / top)
        out.append('<line class="grid" x1="%d" y1="%.1f" x2="%d" y2="%.1f"/>'
                   % (pad_l, y, pad_l + plot_w, y))
        out.append('<text class="tick" x="%d" y="%.1f" text-anchor="end">%s</text>'
                   % (pad_l - 10, y + 4, fmt(v)))
    out.append('<line class="axis" x1="%d" y1="%.1f" x2="%d" y2="%.1f"/>'
               % (pad_l, pad_t + plot_h, pad_l + plot_w, pad_t + plot_h))

    for i, (label, v, tip, role) in enumerate(items):
        h = plot_h * (v / top)
        x = pad_l + slot * i + (slot - bw) / 2
        y = pad_t + plot_h - h
        out.append('<g class="bar" data-tip="%s">' % tip)
        out.append('<rect class="hit" x="%.2f" y="%d" width="%.2f" height="%.2f"/>'
                   % (pad_l + slot * i + 1, pad_t, slot - 2, plot_h))
        out.append('<path d="%s" fill="var(--%s)"/>' % (bar_path(x, y, bw, h), role))
        # 직접 라벨 (밝은 색 막대의 대비 보완 = relief rule)
        out.append('<text class="vallab" x="%.2f" y="%.2f" text-anchor="middle">%s</text>'
                   % (x + bw / 2, y - 8, fmt(v)))
        out.append('<text class="catlab" x="%.2f" y="%.2f" text-anchor="middle">%s</text>'
                   % (x + bw / 2, pad_t + plot_h + 22, label))
        out.append('</g>')
    out.append('</svg>')
    return "".join(out)


CSS = """
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--text-primary);
 font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",
 "Malgun Gothic","Noto Sans KR",sans-serif;line-height:1.55}
.viz-root{color-scheme:light;
 --page:#f6f6f4; --surface-1:#fcfcfb; --border:#e3e2dd;
 --text-primary:#0b0b0b; --text-secondary:#52514e; --text-muted:#86857e;
 --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a;}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{
 color-scheme:dark;
 --page:#121211; --surface-1:#1a1a19; --border:#33322f;
 --text-primary:#ffffff; --text-secondary:#c3c2b7; --text-muted:#8e8d84;
 --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70;}}
:root[data-theme="dark"] .viz-root{color-scheme:dark;
 --page:#121211; --surface-1:#1a1a19; --border:#33322f;
 --text-primary:#ffffff; --text-secondary:#c3c2b7; --text-muted:#8e8d84;
 --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70;}
.wrap{max-width:960px;margin:0 auto;padding:40px 16px 64px}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:17px;margin:0 0 4px}
.sub{color:var(--text-secondary);font-size:14px;margin:0 0 28px}
.card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;
 padding:20px;margin-bottom:20px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:20px}
.tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 18px}
.tile .k{font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:7px}
.tile .k i{width:10px;height:10px;border-radius:3px;display:inline-block}
.tile .v{font-size:30px;font-weight:600;letter-spacing:-.02em;margin-top:6px}
.tile .n{font-size:12px;color:var(--text-muted);margin-top:2px}
.chart{width:100%;height:auto;display:block;overflow:visible}
.grid{stroke:var(--border);stroke-width:1}
.axis{stroke:var(--border);stroke-width:1}
.tick{fill:var(--text-muted);font-size:11px}
.catlab{fill:var(--text-secondary);font-size:13px}
.vallab{fill:var(--text-primary);font-size:12px;font-weight:600}
.hit{fill:transparent}
.bar:hover .hit{fill:var(--text-primary);opacity:.045}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0 0;font-size:13px;color:var(--text-secondary)}
.legend span{display:flex;align-items:center;gap:7px}
.legend i{width:11px;height:11px;border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
th,td{padding:9px 10px;border-bottom:1px solid var(--border);text-align:right}
th:first-child,td:first-child{text-align:left}
th{color:var(--text-secondary);font-weight:500;font-size:12px}
td.name{display:flex;align-items:center;gap:8px}
td.name i{width:10px;height:10px;border-radius:3px;flex:none}
.note{font-size:12.5px;color:var(--text-muted);margin-top:10px}
#tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;
 background:var(--surface-1);border:1px solid var(--border);border-radius:8px;
 padding:9px 11px;font-size:12.5px;color:var(--text-primary);
 box-shadow:0 6px 20px rgba(0,0,0,.14);z-index:9;max-width:240px}
@media (max-width:560px){.wrap{padding:24px 16px 48px}h1{font-size:21px}.tile .v{font-size:25px}
 /* SVG 안 글씨는 viewBox 기준이라, 좁은 화면에선 키워야 읽힌다 */
 .tick{font-size:17px}.catlab{font-size:21px}.vallab{font-size:19px}
 th,td{padding:8px 6px;font-size:12px}}
"""

JS = """
const tip=document.getElementById('tip');
document.querySelectorAll('.bar').forEach(b=>{
  b.addEventListener('pointerenter',()=>{tip.innerHTML=b.dataset.tip;tip.style.opacity=1});
  b.addEventListener('pointermove',e=>{
    const w=tip.offsetWidth,h=tip.offsetHeight;
    let x=e.clientX+14,y=e.clientY-h-12;
    if(x+w>innerWidth-8)x=e.clientX-w-14;
    if(y<8)y=e.clientY+18;
    tip.style.left=x+'px';tip.style.top=y+'px';});
  b.addEventListener('pointerleave',()=>{tip.style.opacity=0});
});
"""


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default=os.path.join(HERE, "daily.csv"))
    p.add_argument("--holidays", default=os.path.join(HERE, "holidays_kr.txt"))
    p.add_argument("--metric", default="audience_top10",
                   choices=["audience_top10", "sales_top10"])
    p.add_argument("--out", default=os.path.join(HERE, "report.html"))
    a = p.parse_args()

    holidays = load_holidays(a.holidays)
    unit = "명" if a.metric == "audience_top10" else "원"
    metric_name = "관객수" if a.metric == "audience_top10" else "매출액"

    groups = {"평일": [], "주말": [], "공휴일": []}
    by_wd = {i: [] for i in range(7)}
    rows = []
    with open(a.csv, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            d = date.fromisoformat(r["date"])
            v = int(r[a.metric])
            g = classify(d, holidays)
            groups[g].append(v)
            if g != "공휴일":            # 요일별 차트는 공휴일 제외 (따로 세니까)
                by_wd[d.weekday()].append(v)
            rows.append((d, g, v))
    if not rows:
        raise SystemExit("CSV 가 비어 있습니다. fetch.py 부터 돌려주세요.")

    span = "%s ~ %s" % (rows[0][0], rows[-1][0])
    role = {"평일": "series-1", "주말": "series-2", "공휴일": "series-3"}
    avg = {g: (statistics.mean(v) if v else 0) for g, v in groups.items()}
    base = avg["평일"] or 1

    # --- 차트 1: 구분별 일평균 ---
    items1 = []
    for g in ["평일", "주말", "공휴일"]:
        if not groups[g]:
            continue
        tip = ("<b>%s</b><br>일평균 %s%s<br>중앙값 %s%s<br>%d일"
               % (g, fmt(avg[g]), unit, fmt(statistics.median(groups[g])), unit, len(groups[g])))
        items1.append((g, avg[g], tip, role[g]))

    # --- 차트 2: 요일별 일평균 (공휴일 제외) ---
    items2 = []
    for i in range(7):
        vals = by_wd[i]
        if not vals:
            continue
        m = statistics.mean(vals)
        r = "series-2" if i >= 5 else "series-1"
        tip = ("<b>%s요일</b><br>일평균 %s%s<br>%d일<br><span style='opacity:.7'>공휴일 제외</span>"
               % (WD[i], fmt(m), unit, len(vals)))
        items2.append((WD[i], m, tip, r))

    def tile(g):
        if not groups[g]:
            return ""
        ratio = "" if g == "평일" else "<div class='n'>평일 대비 %.2f배</div>" % (avg[g] / base)
        return ("<div class='tile'><div class='k'><i style='background:var(--%s)'></i>%s 일평균</div>"
                "<div class='v'>%s</div><div class='n'>%s · %d일 기준</div>%s</div>"
                % (role[g], g, fmt(avg[g]), unit, len(groups[g]), ratio))

    trs = []
    for g in ["평일", "주말", "공휴일"]:
        v = groups[g]
        if not v:
            continue
        trs.append("<tr><td class='name'><i style='background:var(--%s)'></i>%s</td>"
                   "<td>%d</td><td>%s</td><td>%s</td><td>%.2f배</td></tr>"
                   % (role[g], g, len(v), fmt(statistics.mean(v)),
                      fmt(statistics.median(v)), statistics.mean(v) / base))

    legend = ("<div class='legend'>"
              + "".join("<span><i style='background:var(--%s)'></i>%s</span>" % (role[g], g)
                        for g in ["평일", "주말", "공휴일"] if groups[g])
              + "</div>")

    html = (
        "<!doctype html><html lang='ko'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>박스오피스 평일·주말·공휴일 비교</title><style>" + CSS + "</style></head>"
        "<body class='viz-root'><div id='tip'></div><div class='wrap'>"
        "<h1>평일 · 주말 · 공휴일 일평균 " + metric_name + "</h1>"
        "<p class='sub'>" + span + " · 출처 영화진흥위원회 일별 박스오피스</p>"
        "<div class='tiles'>" + tile("평일") + tile("주말") + tile("공휴일") + "</div>"
        "<div class='card'><h2>구분별 일평균</h2>"
        "<p class='sub' style='margin-bottom:8px'>공휴일은 주말과 겹쳐도 공휴일로만 집계</p>"
        + vbar_chart(items1) + legend + "</div>"
        "<div class='card'><h2>요일별 일평균</h2>"
        "<p class='sub' style='margin-bottom:8px'>공휴일에 해당하는 날은 제외</p>"
        + vbar_chart(items2) + "</div>"
        "<div class='card'><h2>표로 보기</h2><table>"
        "<thead><tr><th>구분</th><th>일수</th><th>일평균</th><th>중앙값</th><th>평일 대비</th></tr></thead>"
        "<tbody>" + "".join(trs) + "</tbody></table>"
        "<p class='note'>일별 " + metric_name + "는 그날 상위 10편의 합계입니다"
        " (KOBIS 일별 박스오피스가 top 10만 제공). 전체 합계가 아니므로 절대값보다 "
        "구분 간 비율로 읽으세요. 박스오피스는 흥행작 유무에 크게 흔들려 평균이 위로 "
        "쏠리므로 중앙값도 같이 봤습니다.</p></div>"
        "</div><script>" + JS + "</script></body></html>")

    with open(a.out, "w", encoding="utf-8") as f:
        f.write(html)

    print("== %s ~ %s ==" % (rows[0][0], rows[-1][0]))
    for g in ["평일", "주말", "공휴일"]:
        if groups[g]:
            print("%-4s %4d일  일평균 %12s%s  중앙값 %12s%s  평일대비 %.2f배"
                  % (g, len(groups[g]), fmt(avg[g]), unit,
                     fmt(statistics.median(groups[g])), unit, avg[g] / base))
    print("\n차트 저장: %s" % a.out)


if __name__ == "__main__":
    main()
