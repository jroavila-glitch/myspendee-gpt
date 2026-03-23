import argparse
from pathlib import Path

import fitz


def main() -> None:
    parser = argparse.ArgumentParser(description="Render and dump text from selected PDF pages.")
    parser.add_argument("pdf_path")
    parser.add_argument("--page", type=int, action="append", dest="pages", default=[])
    parser.add_argument("--out-dir", default="/private/tmp/pdf-inspect")
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path).expanduser()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = args.pages or [1]

    for page_number in pages:
        page_index = page_number - 1
        page = doc[page_index]
        image_path = out_dir / f"{pdf_path.stem}-p{page_number}.png"
        text_path = out_dir / f"{pdf_path.stem}-p{page_number}.txt"
        page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(image_path)
        text_path.write_text(page.get_text(), encoding="utf-8")
        print(f"rendered {image_path}")
        print(f"text {text_path}")


if __name__ == "__main__":
    main()
