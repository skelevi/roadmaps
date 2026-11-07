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

    # ---------- для программистов: папка проекта, ссылки на код, TODO ----------
    def pick_folder(self):
        kind = getattr(webview, "FOLDER_DIALOG", None)
        if kind is None:
            kind = webview.FileDialog.FOLDER
        res = self._window.create_file_dialog(kind)
        if not res:
            return None
        return str(res[0] if isinstance(res, (list, tuple)) else res)

    def describe_link(self, target, project=None):
        """Что сделать по ссылке из задачи: открыть сайт, файл в редакторе или показать файл в папке."""
        target = str(target).strip()
        if re.match(r"^https?://", target, re.I):
            return {"kind": "url", "target": target}
        m = re.match(r"^(.*?)(?::(\d+))?(?::\d+)?$", target)
        path_s, line = m.group(1), m.group(2)
        p = Path(path_s)
        if not p.is_absolute():
            if not project:
                return {"kind": "error", "error": "Укажите папку проекта (кнопка «Проект» сверху), чтобы открывать относительные пути"}
            p = Path(project) / p
        p = p.resolve()
        if not p.exists():
            return {"kind": "error", "error": f"Файл не найден: {p}"}
        if p.is_dir():
            return {"kind": "folder", "path": str(p)}
        text_file = p.suffix.lower() in CODE_EXT or p.suffix.lower() in {".json", ".txt", ".ini", ".cfg", ".xml", ".log"}
        editor = find_editor()
        if editor and text_file:
            return {"kind": "editor", "path": str(p), "line": int(line or 1), "editor": editor[0], "style": editor[1],
                    "editor_name": editor[2]}
        if text_file:
            # редактора кода нет — открываем в Блокноте (он ничего не запускает)
            return {"kind": "editor", "path": str(p), "line": int(line or 1), "editor": "notepad.exe", "style": "plain",
                    "editor_name": "Блокнот"}
        if p.suffix.lower() in RUNNABLE:
            # исполняемые файлы не запускаем — только показываем в проводнике
            return {"kind": "reveal", "path": str(p)}
        return {"kind": "file", "path": str(p)}

    def open_link(self, target, project=None):
        import subprocess
        import webbrowser
        d = self.describe_link(target, project)
        k = d["kind"]
        if k == "url":
            webbrowser.open(d["target"])
        elif k == "editor":
            if d["style"] == "goto":          # VS Code / Cursor: -g файл:строка
                args = [d["editor"], "-g", f"{d['path']}:{d['line']}"]
            elif d["style"] == "npp":         # Notepad++: -nСТРОКА файл
                args = [d["editor"], f"-n{d['line']}", d["path"]]
            else:
                args = [d["editor"], d["path"]]
            subprocess.Popen(args, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        elif k == "reveal":
            subprocess.Popen(["explorer", "/select,", d["path"]])
        elif k in ("file", "folder"):
            os.startfile(d["path"])
        return d

    def scan_todos(self, project, limit=500):
        """Ищет TODO/FIXME/HACK/XXX в коде проекта. Возвращает [{file, line, tag, text}]."""
        root = Path(project)
        if not root.is_dir():
            return {"error": f"Папка не найдена: {project}"}
        found = []
        pat = re.compile(r"(?:#|//|/\*|<!--|--|;|\*)\s*(TODO|FIXME|HACK|XXX)\b[\s:(\-]*(.*)", re.I)
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for name in filenames:
                f = Path(dirpath) / name
                if f.suffix.lower() not in CODE_EXT:
                    continue
                try:
                    if f.stat().st_size > 1_000_000:
                        continue
                    lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
                except OSError:
                    continue
                for i, ln in enumerate(lines, 1):
                    mm = pat.search(ln)
                    if mm:
                        text = re.sub(r"\s*(\*/|-->)\s*$", "", mm.group(2)).strip() or "(без описания)"
                        found.append({"file": f.relative_to(root).as_posix(), "line": i,
                                      "tag": mm.group(1).upper(), "text": text[:200]})
                        if len(found) >= limit:
                            return found
        return found


SKIP_DIRS = {"node_modules", "venv", "env", "dist", "build", "__pycache__", "target", "bin", "obj", "out",
             "vendor", "packages", "Library", "Temp"}
CODE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".html", ".css", ".scss",
            ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".java", ".kt", ".go", ".rs", ".rb", ".php", ".swift",
            ".lua", ".gd", ".dart", ".sql", ".sh", ".ps1", ".bat", ".yml", ".yaml", ".toml", ".md"}
RUNNABLE = {".exe", ".bat", ".cmd", ".ps1", ".sh", ".vbs", ".js", ".msi", ".com", ".lnk", ".py", ".pyw"}


def find_editor():
    """Редактор кода, умеющий открыть файл на строке: (путь, способ, название) или None."""
    import shutil
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    pf = Path(os.environ.get("ProgramFiles", ""))
    pf86 = Path(os.environ.get("ProgramFiles(x86)", ""))
    candidates = [
        ("VS Code", "goto", ["code.cmd", "code"], [local / "Programs/Microsoft VS Code/bin/code.cmd",
                                                     pf / "Microsoft VS Code/bin/code.cmd"]),
        ("Cursor", "goto", ["cursor.cmd", "cursor"], [local / "Programs/cursor/resources/app/bin/cursor.cmd"]),
        ("Notepad++", "npp", ["notepad++.exe"], [pf / "Notepad++/notepad++.exe", pf86 / "Notepad++/notepad++.exe"]),
    ]
    for name, style, names, paths in candidates:
        for n in names:
            p = shutil.which(n)
            if p:
                return p, style, name
        for p in paths:
            if p.exists():
                return str(p), style, name
    return None


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
