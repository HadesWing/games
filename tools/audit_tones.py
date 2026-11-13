#!/usr/bin/env python3
"""审计 data/speech.json 的读音声调是否符合教学标准。

教学标准（部编人教版 / 侨网引述教学专家）：
    声母、韵母的「呼读音」= 该音节的**第一声（阴平）**。
    ——「所谓'呼读音'就是声母与其相应的单韵母拼读而成的音节的第一声，即阴平声。」
    而《汉语拼音方案》的声母韵母表里「鹅/熬/儿/昂」是**代表字**，
    声调属于音节，声母韵母本身不标调；教学时统一读第一声。

检查三件事：
    1. letters 的 cmn 调号必须全为 1（对应上游真人录音文件）
    2. letters 的 say 汉字本身必须读第一声（否则 TTS 兜底会读错调）
    3. syllables 的调必须与 data/pinyin.json 里的例词一致

汉字读音依据 mozillazg/pinyin-data（Unicode → 拼音的权威字典），需联网。
离线时若字典取不到，退化为「只查 cmn 调号」并提示。

用法：
    python tools/audit_tones.py            # 完整审计
    python tools/audit_tones.py --offline  # 只查调号，不联网
退出码 0 表示全部通过。
"""

import json
import pathlib
import re
import sys
import unicodedata
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEECH = ROOT / "data" / "speech.json"
PINYIN = ROOT / "data" / "pinyin.json"
DICT_URL = ("https://api.github.com/repos/mozillazg/pinyin-data"
            "/contents/pinyin.txt")
TONE_MARKS = {0x0304: "1", 0x0301: "2", 0x030C: "3", 0x0300: "4"}
TONE_CN = {"1": "一声", "2": "二声", "3": "三声", "4": "四声"}


def normalize(py: str) -> str:
    """带调拼音 → '音节+数字'（ü 写作 v）。"""
    py = unicodedata.normalize("NFKD", py)
    out, tone = "", ""
    for ch in py:
        cp = ord(ch)
        if cp in TONE_MARKS:
            tone = TONE_MARKS[cp]
        elif ch in "üÜ":
            out += "v"
        else:
            out += ch
    return out + tone


def tone_of(py: str) -> str:
    """取一个带调拼音的调号（'1'~'4'）；无调号返回 ''。"""
    key = normalize(py)
    return key[-1] if key[-1].isdigit() else ""


def load_dict():
    import base64
    req = urllib.request.Request(DICT_URL, headers={"User-Agent": "workbuddy"})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    txt = base64.b64decode(d["content"]).decode("utf-8", "replace")
    table = {}
    for line in txt.splitlines():
        if ":" not in line:
            continue
        _, _, right = line.partition(":")
        right, _, comment = right.partition("#")
        han = comment.strip()
        for py in right.split(","):
            py = py.strip()
            if not py:
                continue
            key = normalize(py)
            table.setdefault(key, [])
            if han and han not in table[key]:
                table[key].append(han)
    return table


def main() -> int:
    offline = "--offline" in sys.argv
    speech = json.loads(SPEECH.read_text(encoding="utf-8"))
    pinyin = json.loads(PINYIN.read_text(encoding="utf-8"))
    syl_words = {e["syl"]: e for e in pinyin["syllables"]}
    fails = []

    print("=" * 72)
    print("1) 字母呼读音：cmn 调号必须为 1（教学标准：呼读音读第一声）")
    print("=" * 72)
    for key, v in speech["letters"].items():
        cmn = v["cmn"]
        if not re.match(r"^[a-z]+[1-5]$", cmn):
            fails.append(f"{key}: cmn 格式异常 {cmn}")
            print(f"  ✗ {key:4s} {cmn} 格式异常")
            continue
        tone = cmn[-1]
        if tone != "1":
            fails.append(f"{key}: cmn={cmn} 不是第一声")
            print(f"  ✗ {key:4s} {cmn:6s} 读作{TONE_CN.get(tone, tone)}")
    print(f"  检查 {len(speech['letters'])} 条")

    print()
    print("=" * 72)
    print("2) 音节：调号须与例词一致")
    print("=" * 72)
    for key, v in speech["syllables"].items():
        e = syl_words.get(key)
        if not e:
            fails.append(f"音节 {key} 在 pinyin.json 里没有例词")
            continue
        want = tone_of(e["tone"])
        if want and want != v["cmn"][-1]:
            fails.append(f"音节 {key}: cmn={v['cmn']} 与例词 {e['tone']} 不符")
            print(f"  ✗ {key:6s} cmn={v['cmn']} 例词={e['tone']}({e['word']})")
    print(f"  检查 {len(speech['syllables'])} 条")

    if not offline:
        print()
        print("=" * 72)
        print("3) TTS 兜底汉字：say 本身必须读第一声")
        print("=" * 72)
        try:
            table = load_dict()
        except Exception as exc:
            print(f"  (字典获取失败，跳过：{type(exc).__name__})")
            table = None
        if table:
            for key, v in speech["letters"].items():
                base = v["cmn"][:-1]
                say = v.get("say", "")
                if not say:
                    continue
                reads = sorted({k for k, chars in table.items() if say in chars})
                # 多音字只要「该字在本音节下有一声读法」即算合格
                if base + "1" not in reads:
                    fails.append(f"{key}: say「{say}」不读第一声（该字读 {'/'.join(reads)}）")
                    print(f"  ✗ {key:4s} say={say} → 该字读 {'/'.join(reads)}")
            print(f"  检查 {len(speech['letters'])} 条")
            empty = [k for k, v in speech["letters"].items() if not v.get("say")]
            if empty:
                print(f"  · 无汉字可用的条目（普通话不成词，依赖真人录音）：{empty}")

    print()
    if fails:
        print(f"审计未通过，{len(fails)} 项问题：")
        for f in fails:
            print("   -", f)
        return 1
    print("审计通过 ✅  全部声调符合教学标准")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
