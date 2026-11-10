#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按 data/speech.json 拉取开源真人拼音录音，生成 audio/pinyin/<拼音>.mp3。

音频来源：https://github.com/hugolpz/audio-cmn  （64k/syllabs，Chen Wang 录制，CC BY-SA）
只取本项目需要的音节，重命名为游戏内部使用的拼音 key；ü 写作 v 以避开非 ASCII 文件名。
音频文件已随仓库附带，本脚本仅用于重新生成 / 校验，正常游玩不需要运行。

用法：
    python tools/fetch_audio.py --check          # 只校验映射表与音频文件是否齐全
    python tools/fetch_audio.py                  # 下载整包并提取（约 300MB，仅首次）
    python tools/fetch_audio.py --zip <路径>     # 用本地已下载的 zip 提取，免联网
"""

import argparse
import json
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEECH_FILE = ROOT / "data" / "speech.json"
PINYIN_FILE = ROOT / "data" / "pinyin.json"
OUT_DIR = ROOT / "audio" / "pinyin"
ZIP_URL = "https://codeload.github.com/hugolpz/audio-cmn/zip/master"
CACHE_ZIP = Path(tempfile.gettempdir()) / "audio-cmn-master.zip"


def safe_key(key: str) -> str:
    """与 GDScript PinyinData.audio_key() 保持一致的 ASCII 文件名规则。"""
    return key.replace("ü", "v")


def all_items(speech: dict):
    for group in ("letters", "syllables"):
        for key, val in speech.get(group, {}).items():
            yield group, key, val["cmn"], val["say"]


def check(speech: dict, pinyin: dict) -> list:
    """返回问题列表；空列表表示映射表完整。"""
    problems = []
    letters = speech.get("letters", {})
    syllables = speech.get("syllables", {})

    stage_letters = []
    for stage in pinyin.get("stages", []):
        stage_letters.extend(stage.get("letters", []))
    for key in stage_letters:
        if key not in letters:
            problems.append("字母表缺少读音映射: %s" % key)
    for key in letters:
        if key not in stage_letters and key not in ("y", "w"):
            problems.append("读音映射里有未使用的字母: %s" % key)
    for entry in pinyin.get("syllables", []):
        syl = entry.get("syl", "")
        if syl not in syllables:
            problems.append("音节缺少读音映射: %s" % syl)
        for part in (entry.get("s", ""), entry.get("y", "")):
            if part not in letters:
                problems.append("音节的声/韵母缺少读音映射: %s (%s)" % (part, syl))

    for group, key, cmn, say in all_items(speech):
        if not cmn or not say:
            problems.append("%s/%s 的 cmn 或 say 为空" % (group, key))
    if len(set(safe_key(k) for _, k, _, _ in all_items(speech))) != sum(
        1 for _ in all_items(speech)
    ):
        problems.append("归一化后出现重名 key")
    return problems


def check_files(speech: dict) -> list:
    missing = []
    for _, key, _, _ in all_items(speech):
        p = OUT_DIR / (safe_key(key) + ".mp3")
        if not p.exists() or p.stat().st_size < 1000:
            missing.append(p.name)
    return missing


def obtain_zip(explicit: str) -> Path:
    if explicit:
        return Path(explicit)
    if CACHE_ZIP.exists() and CACHE_ZIP.stat().st_size > 100_000_000:
        print("复用本地缓存:", CACHE_ZIP)
        return CACHE_ZIP
    print("下载音频整包（约 300MB，仅首次）:", ZIP_URL)
    tmp = CACHE_ZIP.with_suffix(".downloading")
    req = urllib.request.Request(ZIP_URL, headers={"User-Agent": "workbuddy"})
    with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.replace(CACHE_ZIP)
    return CACHE_ZIP


def extract(zip_path: Path, speech: dict) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    with zipfile.ZipFile(zip_path) as z:
        available = {
            name.split("/")[-1]: name
            for name in z.namelist()
            if "/64k/syllabs/" in name and name.endswith(".mp3")
        }
        for _, key, cmn, _ in all_items(speech):
            src = available.get("cmn-%s.mp3" % cmn)
            if src is None:
                print("缺失上游音频: cmn-%s.mp3 (%s)" % (cmn, key), file=sys.stderr)
                continue
            target = OUT_DIR / (safe_key(key) + ".mp3")
            target.write_bytes(z.read(src))
            written += 1
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不下载")
    ap.add_argument("--zip", default="", help="本地 zip 路径")
    args = ap.parse_args()

    speech = json.loads(SPEECH_FILE.read_text(encoding="utf-8"))
    pinyin = json.loads(PINYIN_FILE.read_text(encoding="utf-8"))

    problems = check(speech, pinyin)
    if problems:
        for p in problems:
            print("FAIL", p, file=sys.stderr)
        return 1
    total = sum(1 for _ in all_items(speech))
    print("PASS 映射表完整: %d 个读音（%d 字母 + %d 音节）" % (
        total, len(speech["letters"]), len(speech["syllables"])))

    if args.check:
        missing = check_files(speech)
        if missing:
            print("FAIL 音频文件缺失 %d 个: %s" % (len(missing), ", ".join(missing[:10])),
                  file=sys.stderr)
            return 1
        print("PASS 音频文件齐全: %d 个 mp3" % total)
        return 0

    zp = obtain_zip(args.zip)
    n = extract(zp, speech)
    print("已写入 %d / %d 个 mp3 → %s" % (n, total, OUT_DIR))
    return 0 if n == total else 1


if __name__ == "__main__":
    sys.exit(main())
