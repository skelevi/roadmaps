"""Дорожные карты — настольное приложение.

Каждая карта хранится в папке roadmaps/ как отдельный JSON-файл.
Приложение само подхватывает изменения файлов (например, когда карту пишет Claude).
Формат файла описан в CLAUDE.md.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import webview

if getattr(sys, "frozen", False):  # собранный .exe
    BASE = Path(sys.executable).parent
    BUNDLE = Path(sys._MEIPASS)
else:
    BASE = Path(__file__).parent
    BUNDLE = BASE
UI_DIR = BUNDLE / "ui"

MAPS_DIR = BASE / "roadmaps"
if not MAPS_DIR.exists():
    # первый запуск: кладём пример карты, чтобы было с чего начать
    MAPS_DIR.mkdir()
    for ex in (BUNDLE / "examples").glob("*.json"):
        (MAPS_DIR / ex.name).write_bytes(ex.read_bytes())


def slugify(text: str) -> str:
    tr = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                  ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p",
                   "r", "s", "t", "u", "f", "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))
    s = "".join(tr.get(c, c) for c in text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "map"


def task_parts(t):
    """Задача может быть строкой ("[x] текст") или объектом {"text", "done"}."""
    if isinstance(t, str):
        done = bool(re.match(r"^\s*\[[xXхХ]\]", t))
        return re.sub(r"^\s*\[[xXхХ ]?\]\s*", "", t), done
    if isinstance(t, dict):
        return str(t.get("text", "")), bool(t.get("done"))
    return str(t), False


class Api:
    def __init__(self):
        self._window = None  # с подчёркиванием, чтобы pywebview не отдавал окно в JS

    # ---------- список и чтение ----------
    def list_maps(self):
        result = []
        for f in sorted(MAPS_DIR.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8-sig"))
            except Exception as e:  # битый файл не должен ронять приложение
                result.append({"id": f.stem, "title": f.stem, "error": str(e), "total": 0, "done": 0,
                               "order": 9999, "mtime": f.stat().st_mtime})
                continue
            total = done = 0
            for st in data.get("stages", []):
                for t in st.get("tasks") or []:
                    total += 1
                    done += 1 if task_parts(t)[1] else 0
            result.append({
                "id": f.stem,
                "title": data.get("title", f.stem),
                "order": data.get("order", 9999),
                "total": total,
                "done": done,
                "mtime": f.stat().st_mtime,
            })
        result.sort(key=lambda m: (m["order"], m["title"].lower()))
        return result

    def load_map(self, map_id):
        f = MAPS_DIR / f"{map_id}.json"
        if not f.exists():
            return None
        try:
            data = json.loads(f.read_text(encoding="utf-8-sig"))
        except Exception as e:
            return {"error": f"Файл {f.name} повреждён: {e}"}
        return {"id": map_id, "mtime": f.stat().st_mtime, "data": data}

    def mtimes(self):
        return {f.stem: f.stat().st_mtime for f in MAPS_DIR.glob("*.json")}

    # ---------- запись ----------
    def save_map(self, map_id, data):
        f = MAPS_DIR / f"{map_id}.json"
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, f)
        return f.stat().st_mtime

    def create_map(self, title):
        base = slugify(title)
        map_id, n = base, 2
        while (MAPS_DIR / f"{map_id}.json").exists():
            map_id, n = f"{base}-{n}", n + 1
        data = {"title": title, "stages": [], "notes": []}
        self.save_map(map_id, data)
        return map_id

    def delete_map(self, map_id):
        f = MAPS_DIR / f"{map_id}.json"
        if f.exists():
            trash = MAPS_DIR / ".trash"
            trash.mkdir(exist_ok=True)
            os.replace(f, trash / f"{map_id}-{int(time.time())}.json")
        return True

    # ---------- экспорт ----------
    def export_markdown(self, map_id):
        loaded = self.load_map(map_id)
        if not loaded or "data" not in loaded:
            return False
        data = loaded["data"]
        lines = [f"# {data.get('title', map_id)}", ""]
        if data.get("description"):
            lines += [data["description"], ""]
        for st in data.get("stages", []):
            tasks = [task_parts(t) for t in st.get("tasks") or []]
            done = sum(1 for _, d in tasks if d)
            mark = "◆ " if st.get("type") == "milestone" else ""
            lines.append(f"## {mark}{st.get('title', '')}  ({done}/{len(tasks)})")
            if st.get("description"):
                lines.append(st["description"])
            if st.get("after"):
                lines.append(f"_После: {', '.join(st['after'])}_")
            lines.append("")
            for text, d in tasks:
                lines.append(f"- [{'x' if d else ' '}] {text}")
            lines.append("")
        path = self._window.create_file_dialog(
            webview.SAVE_DIALOG, save_filename=f"{map_id}.md", file_types=("Markdown (*.md)",))
        if not path:
            return False
        if isinstance(path, (list, tuple)):
            path = path[0]
        Path(path).write_text("\n".join(lines), encoding="utf-8")
        return True

    def save_png(self, map_id, data_url):
        import base64
        path = self._window.create_file_dialog(
            webview.SAVE_DIALOG, save_filename=f"{map_id}.png", file_types=("PNG (*.png)",))
        if not path:
            return False
        if isinstance(path, (list, tuple)):
            path = path[0]
        Path(path).write_bytes(base64.b64decode(data_url.split(",", 1)[1]))
        return True

    def open_folder(self):
        os.startfile(MAPS_DIR)
        return True


def main():
    api = Api()
    window = webview.create_window(
        "Дорожные карты",
        str(UI_DIR / "index.html"),
        js_api=api,
        width=1500, height=920, min_size=(900, 600),
        background_color="#0a0e17",
    )
    api._window = window
    # private_mode=False — чтобы приложение помнило масштаб и последнюю открытую карту
    webview.start(debug="--debug" in sys.argv, private_mode=False,
                  storage_path=str(BASE / ".webview"))


if __name__ == "__main__":
    main()
