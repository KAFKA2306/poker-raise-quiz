from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE_CONFIG = ROOT / "data" / "sources" / "ipa" / "sessions.json"
CACHE_ROOT = ROOT / ".cache" / "official-question-crops"


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "KAFKA2306-poker-raise-quiz-importer"})
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def question_headers(page: fitz.Page) -> list[tuple[int, float]]:
    lines: dict[tuple[int, int], list[tuple[float, float, str]]] = {}
    for word in page.get_text("words", sort=True):
        x0, y0, _x1, _y1, text, block_no, line_no, _word_no = word
        lines.setdefault((block_no, line_no), []).append((x0, y0, text))

    found: list[tuple[int, float]] = []
    for words in lines.values():
        words.sort(key=lambda item: item[0])
        text = "".join(item[2] for item in words).strip()
        match = re.match(r"^問\s*([1-9]|[1-7][0-9]|80)(?:\D|$)", text)
        if match:
            found.append((int(match.group(1)), min(item[1] for item in words)))
    return sorted(found, key=lambda item: item[1])


def render_session(session: dict) -> None:
    session_id = session["id"]
    pdf_path = CACHE_ROOT / session_id / "questions.pdf"
    output_dir = CACHE_ROOT / session_id / "questions"
    output_dir.mkdir(parents=True, exist_ok=True)
    download(session["questionPdfUrl"], pdf_path)

    document = fitz.open(pdf_path)
    locations: dict[int, tuple[int, float, float]] = {}

    for page_index, page in enumerate(document):
        headers = question_headers(page)
        for index, (question_no, y0) in enumerate(headers):
            if question_no in locations:
                continue
            y1 = headers[index + 1][1] - 7 if index + 1 < len(headers) else page.rect.height - 18
            locations[question_no] = (page_index, max(12, y0 - 7), max(y0 + 20, y1))

    missing = [number for number in range(1, 81) if number not in locations]
    if missing:
        raise RuntimeError(f"{session_id}: 問題位置を検出できません: {missing}")

    matrix = fitz.Matrix(2.0, 2.0)
    for question_no in range(1, 81):
        page_index, y0, y1 = locations[question_no]
        page = document[page_index]
        clip = fitz.Rect(18, y0, page.rect.width - 18, min(y1, page.rect.height - 12))
        pixmap = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        pixmap.save(output_dir / f"q{question_no:03d}.png")

    print(f"{session_id}: IPA公式PDFから80問の画像領域を生成")


def main() -> None:
    config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))
    for session in config["sessions"]:
        render_session(session)


if __name__ == "__main__":
    main()
