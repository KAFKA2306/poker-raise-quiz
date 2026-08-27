from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import tempfile
import unicodedata
import urllib.request
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE_CONFIG = ROOT / "data" / "sources" / "ipa" / "sessions.json"
CACHE_ROOT = ROOT / ".cache" / "official-question-crops"
OCR_SCALE = 2.0
HEADER_CHARS = "問間閣門"


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "KAFKA2306-poker-raise-quiz-importer"})
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).replace(" ", "").replace("　", "")


def valid_question_number(value: str) -> int | None:
    if not re.fullmatch(r"\d{1,2}", value):
        return None
    number = int(value)
    return number if 1 <= number <= 80 else None


def number_from_tokens(tokens: list[str]) -> int | None:
    cleaned = [normalize(token).strip() for token in tokens if normalize(token).strip()]
    for index, token in enumerate(cleaned[:4]):
        joined = re.fullmatch(rf"[{HEADER_CHARS}][:\-]?(\d{{1,2}})", token)
        if joined:
            return valid_question_number(joined.group(1))
        if re.fullmatch(rf"[{HEADER_CHARS}][:\-]?", token) and index + 1 < len(cleaned):
            return valid_question_number(re.sub(r"\D", "", cleaned[index + 1]))
    return None


def native_headers(page: fitz.Page) -> list[tuple[int, float]]:
    lines: dict[tuple[int, int], list[tuple[float, float, str]]] = {}
    for word in page.get_text("words", sort=True):
        x0, y0, _x1, _y1, text, block_no, line_no, _word_no = word
        lines.setdefault((block_no, line_no), []).append((x0, y0, text))
    found: list[tuple[int, float]] = []
    for words in lines.values():
        words.sort(key=lambda item: item[0])
        question_no = number_from_tokens([item[2] for item in words])
        if question_no is not None:
            found.append((question_no, min(item[1] for item in words)))
    return sorted(found, key=lambda item: item[1])


def ocr_headers(page: fitz.Page) -> list[tuple[int, float]]:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(OCR_SCALE, OCR_SCALE), alpha=False)
    with tempfile.TemporaryDirectory() as temporary_directory:
        image_path = Path(temporary_directory) / "page.png"
        pixmap.save(image_path)
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "jpn+eng", "--psm", "6", "tsv"],
            check=True,
            capture_output=True,
            text=True,
        )
    rows = csv.DictReader(io.StringIO(result.stdout), delimiter="\t")
    lines: dict[tuple[str, str, str, str], list[dict[str, str]]] = {}
    for row in rows:
        if not (row.get("text") or "").strip():
            continue
        key = (row["page_num"], row["block_num"], row["par_num"], row["line_num"])
        lines.setdefault(key, []).append(row)
    found: list[tuple[int, float]] = []
    for words in lines.values():
        words.sort(key=lambda row: int(row["left"]))
        if min(int(row["left"]) for row in words) > pixmap.width * 0.22:
            continue
        question_no = number_from_tokens([row["text"] for row in words])
        if question_no is None:
            continue
        found.append((question_no, min(int(row["top"]) for row in words) / OCR_SCALE))
    return sorted(found, key=lambda item: item[1])


def question_headers(page: fitz.Page) -> list[tuple[int, float]]:
    found = native_headers(page)
    return found if found else ocr_headers(page)


def render_session(session: dict) -> None:
    session_id = session["id"]
    pdf_path = CACHE_ROOT / session_id / "questions.pdf"
    output_dir = CACHE_ROOT / session_id / "questions"
    output_dir.mkdir(parents=True, exist_ok=True)
    download(session["questionPdfUrl"], pdf_path)
    document = fitz.open(pdf_path)

    raw_pages: list[tuple[int, list[tuple[int, float]]]] = []
    for page_index, page in enumerate(document):
        headers = question_headers(page)
        if headers:
            raw_pages.append((page_index, headers))

    # IPA問題冊子は問1から問80まで昇順で並ぶ。OCRが本文中の数字を問番号と
    # 誤認識した場合は、直前に採用した番号から大きく飛ぶ候補を捨てる。
    filtered_pages: dict[int, list[tuple[int, float]]] = {}
    last_number = 0
    for page_index, headers in raw_pages:
        accepted: list[tuple[int, float]] = []
        for question_no, y0 in headers:
            if question_no <= last_number:
                continue
            if last_number and question_no - last_number > 4:
                continue
            accepted.append((question_no, y0))
            last_number = question_no
        if accepted:
            filtered_pages[page_index] = accepted

    locations: dict[int, tuple[int, float, float]] = {}
    for page_index, headers in filtered_pages.items():
        page = document[page_index]
        for index, (question_no, y0) in enumerate(headers):
            y1 = headers[index + 1][1] - 6 if index + 1 < len(headers) else page.rect.height - 18
            locations[question_no] = (page_index, max(12, y0 - 6), max(y0 + 20, y1))

    matrix = fitz.Matrix(2.0, 2.0)
    for question_no, (page_index, y0, y1) in locations.items():
        page = document[page_index]
        clip = fitz.Rect(18, y0, page.rect.width - 18, min(y1, page.rect.height - 12))
        page.get_pixmap(matrix=matrix, clip=clip, alpha=False).save(output_dir / f"q{question_no:03d}.png")

    missing = [number for number in range(1, 81) if number not in locations]
    print(f"{session_id}: 公式問題画像 {len(locations)}問分を生成。未検出={missing}")


def main() -> None:
    config = json.loads(SOURCE_CONFIG.read_text(encoding="utf-8"))
    for session in config["sessions"]:
        render_session(session)


if __name__ == "__main__":
    main()
