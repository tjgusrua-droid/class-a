"""Rebuild data/lotto_history.json from smok95/lotto's results/all.json.

Usage:
    git clone --depth 1 https://github.com/smok95/lotto /tmp/smok95-lotto
    python3 scripts/build_lotto_data.py /tmp/smok95-lotto/results/all.json data/lotto_history.json
"""
import json
import sys


def main(src_path: str, dst_path: str) -> None:
    with open(src_path, encoding="utf-8") as f:
        draws = json.load(f)

    rows = [
        {"n": r["draw_no"], "d": r["date"][:10], "k": r["numbers"], "b": r["bonus_no"]}
        for r in draws
    ]
    rows.sort(key=lambda r: r["n"])

    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {len(rows)} draws to {dst_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all.json",
         sys.argv[2] if len(sys.argv) > 2 else "data/lotto_history.json")
