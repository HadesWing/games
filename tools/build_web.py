#!/usr/bin/env python3
"""把 data/*.json 与 audio/pinyin/*.mp3 内嵌进 web/template.html，产出单文件 web/index.html。

用法：
    python tools/build_web.py            # 生成 web/index.html
    python tools/build_web.py --check    # 只校验产物完整性与音频覆盖

产物完全自包含：双击 web/index.html 即可离线游玩，发布时只需拷贝这一个文件。
音频来自 audio/pinyin/（audio-cmn，CC BY-SA），署名见 audio/pinyin/CREDITS.md。
"""

import argparse
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "web" / "template.html"
OUTPUT = ROOT / "web" / "index.html"
PINYIN = ROOT / "data" / "pinyin.json"
SPEECH = ROOT / "data" / "speech.json"
AUDIO_DIR = ROOT / "audio" / "pinyin"


def audio_key(key: str) -> str:
    """与网页版 core 里的 audioKey() 保持一致：ü 在文件名里写作 v。"""
    return key.replace("ü", "v")


def needed_keys() -> list[str]:
    pinyin = json.loads(PINYIN.read_text(encoding="utf-8"))
    speech = json.loads(SPEECH.read_text(encoding="utf-8"))
    keys = []
    for stage in pinyin["stages"]:
        keys.extend(stage["letters"])
    keys.extend(e["syl"] for e in pinyin["syllables"])
    keys.extend(speech["letters"].keys())
    keys.extend(speech["syllables"].keys())
    return sorted({audio_key(k) for k in keys})


def build() -> None:
    template = TEMPLATE.read_text(encoding="utf-8")
    for marker in ("__AUDIO_DATA__", "__PINYIN_DATA__", "__SPEECH_DATA__"):
        if marker not in template:
            raise SystemExit(f"模板缺少占位符 {marker}")

    keys = needed_keys()
    audio = {}
    missing = []
    for key in keys:
        path = AUDIO_DIR / f"{key}.mp3"
        if not path.is_file():
            missing.append(key)
            continue
        raw = path.read_bytes()
        if not raw.startswith(b"ID3") and raw[:2] not in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
            raise SystemExit(f"不是有效的 MP3：{path}")
        audio[key] = "data:audio/mpeg;base64," + base64.b64encode(raw).decode("ascii")
    if missing:
        raise SystemExit(f"缺少 {len(missing)} 个音频：{missing[:10]}")

    replacements = {
        "__AUDIO_DATA__": json.dumps(audio, ensure_ascii=False, separators=(",", ":")),
        "__PINYIN_DATA__": json.dumps(
            json.loads(PINYIN.read_text(encoding="utf-8")),
            ensure_ascii=False, separators=(",", ":")),
        "__SPEECH_DATA__": json.dumps(
            json.loads(SPEECH.read_text(encoding="utf-8")),
            ensure_ascii=False, separators=(",", ":")),
    }
    html = template
    for marker, value in replacements.items():
        html = html.replace(marker, value)
    OUTPUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"生成 {OUTPUT.relative_to(ROOT)}：{OUTPUT.stat().st_size:,} 字节，"
          f"内嵌 {len(audio)} 条音频")


def check() -> None:
    if not OUTPUT.is_file():
        raise SystemExit(f"产物不存在：{OUTPUT}")
    html = OUTPUT.read_text(encoding="utf-8")
    for marker in ("__AUDIO_DATA__", "__PINYIN_DATA__", "__SPEECH_DATA__"):
        if marker in html:
            raise SystemExit(f"产物仍有未替换占位符 {marker}")

    m = re.search(r'<script id="audio-data">const AUDIO = (\{.*?\});</script>', html, re.S)
    if not m:
        raise SystemExit("产物里找不到内嵌音频数据")
    audio = json.loads(m.group(1))
    keys = needed_keys()
    missing = [k for k in keys if k not in audio]
    if missing:
        raise SystemExit(f"产物缺少 {len(missing)} 条音频：{missing[:10]}")

    bad = []
    for key, uri in audio.items():
        if not uri.startswith("data:audio/mpeg;base64,"):
            bad.append(key)
            continue
        raw = base64.b64decode(uri.split(",", 1)[1], validate=True)
        if len(raw) < 1000:
            bad.append(key)
    if bad:
        raise SystemExit(f"音频数据异常：{bad[:10]}")

    for token in ('id="core"', 'id="ui"', "function makeFishRound", "function showResult"):
        if token not in html:
            raise SystemExit(f"产物缺少关键片段：{token}")
    # 只禁止脚本/样式/图片/音频类资源外链；署名用的 <a href> 不算依赖
    if re.search(r'<(?:script|link|img|audio|source|video)\b[^>]*(?:src|href)\s*=\s*"https?://', html):
        raise SystemExit("产物含外部资源引用，不是自包含文件")
    print(f"校验通过：{len(audio)} 条内嵌音频、{len(keys)} 个读音全覆盖，"
          f"产物 {OUTPUT.stat().st_size:,} 字节，无外链依赖")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验产物")
    args = ap.parse_args()
    try:
        check() if args.check else build()
    except SystemExit as exc:
        print(f"失败：{exc}", file=sys.stderr)
        raise
