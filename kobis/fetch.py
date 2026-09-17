#!/usr/bin/env python3
"""KOBIS 일별 박스오피스를 하루씩 받아서 CSV로 저장한다.

사용법:
    KOBIS_KEY=발급받은키 python3 fetch.py --start 2024-09-01 --end 2025-08-31

받은 날짜별 원본 JSON은 cache/ 에 저장되므로, 중간에 끊겨도 다시 돌리면
안 받은 날짜부터 이어서 받는다.

주의: KOBIS 일별 박스오피스는 그날의 상위 10편만 준다. 따라서 여기서 만드는
'일별 관객수'는 '그날 전체 관객수'가 아니라 '그날 top 10 합계'다.
보통 전체의 90~97%를 차지하므로 평일/주말 비율 비교에는 충분하지만,
절대값을 전체 관객수라고 말하면 안 된다.
"""
import argparse, csv, json, os, sys, time, urllib.request, urllib.error
from datetime import date, timedelta

BASE = "http://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def fetch_day(key, d, retries=4):
    path = os.path.join(CACHE, d.strftime("%Y%m%d") + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    url = "%s?key=%s&targetDt=%s" % (BASE, key, d.strftime("%Y%m%d"))
    delay = 2
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as e:                      # 네트워크 오류 -> 지수 백오프
            if attempt == retries - 1:
                raise
            print("  재시도 %d회차 (%s) ... %ds 대기" % (attempt + 1, e, delay), file=sys.stderr)
            time.sleep(delay)
            delay *= 2

    if "faultInfo" in data:                          # 키 오류 등
        raise SystemExit("KOBIS 오류: %s" % data["faultInfo"].get("message"))

    os.makedirs(CACHE, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--key", default=os.environ.get("KOBIS_KEY"))
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD")
    p.add_argument("--out", default=os.path.join(HERE, "daily.csv"))
    p.add_argument("--sleep", type=float, default=0.2, help="요청 간 간격(초)")
    a = p.parse_args()

    if not a.key:
        raise SystemExit("API 키가 없습니다. KOBIS_KEY 환경변수나 --key 로 넣어주세요.")

    start = date.fromisoformat(a.start)
    end = date.fromisoformat(a.end)
    if start > end:
        raise SystemExit("--start 가 --end 보다 뒤입니다.")

    rows = []
    days = list(daterange(start, end))
    for i, d in enumerate(days, 1):
        cached = os.path.exists(os.path.join(CACHE, d.strftime("%Y%m%d") + ".json"))
        data = fetch_day(a.key, d)
        lst = data.get("boxOfficeResult", {}).get("dailyBoxOfficeList", [])
        audi = sum(int(x["audiCnt"]) for x in lst)
        sales = sum(int(x["salesAmt"]) for x in lst)
        scrn = sum(int(x["scrnCnt"]) for x in lst)
        show = sum(int(x["showCnt"]) for x in lst)
        rows.append({
            "date": d.isoformat(),
            "audience_top10": audi,
            "sales_top10": sales,
            "screens_top10": scrn,
            "shows_top10": show,
            "titles": len(lst),
            "top1": lst[0]["movieNm"] if lst else "",
        })
        print("[%4d/%4d] %s  관객 %9s  %s" % (
            i, len(days), d, format(audi, ","), "(캐시)" if cached else ""))
        if not cached:
            time.sleep(a.sleep)

    with open(a.out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print("\n저장 완료: %s (%d일치)" % (a.out, len(rows)))


if __name__ == "__main__":
    main()
