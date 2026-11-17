import fitz
from pypdf import PdfReader

SRC = r"D:\Qoder\course-cards\samples\sample-text.pdf"
DST = r"D:\Qoder\course-cards\samples\sample-scan.pdf"

src = fitz.open(SRC)
out = fitz.open()
for page in src:
    pix = page.get_pixmap(dpi=140, colorspace=fitz.csGRAY)
    jpg = pix.tobytes("jpeg", jpg_quality=68)
    p = out.new_page(width=page.rect.width, height=page.rect.height)
    p.insert_image(p.rect, stream=jpg)
out.save(DST, garbage=4, deflate=True)

for path in (SRC, DST):
    r = PdfReader(path)
    text = "".join(pg.extract_text() or "" for pg in r.pages)
    print(path.split("\\")[-1], "| pages:", len(r.pages), "| text chars:", len(text.strip()))
    if text.strip():
        print("  sample:", text.strip()[:60].replace("\n", " "))