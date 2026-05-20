"""Download or verify the six real datasheets referenced in the assignment."""

from __future__ import annotations

import ssl
import sys
import urllib.request
from pathlib import Path

project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.core.config import settings


REAL_PDFS = {
    "QC-ES-1500-RF.pdf": {
        "url": "https://quietcoolsystems.com/wp-content/uploads/2024/12/QC-ES-1500-RF.pdf",
        "aliases": [],
    },
    "consta-flow-sell-sheet_r2.pdf": {
        "url": "https://iwiinc.com/files/consta-flow-sell-sheet_r2.pdf",
        "aliases": ["consta-flow-sell-sheet.pdf"],
    },
    "KBF514.pdf": {
        "url": "https://karran.com/media/catalog/spec-sheets/faucet/KBF514.pdf",
        "aliases": [],
    },
    "3470AB.pdf": {
        "url": "https://redwhitevalvecorp.com/pdfs/3470AB.pdf",
        "aliases": [],
    },
    "Day_Brite_CFI_FCY_LED_High_Bay_Spec_Sheet.pdf": {
        "url": "https://genlyte.com/api/assets/v1/file/Signify/content/FCY-LED-high-bay/Day_Brite_CFI_FCY_LED_High_Bay_Spec_Sheet.pdf",
        "aliases": ["FCY-LED-high-bay.pdf"],
    },
    "cRC-DI.pdf": {
        "url": "https://docs.esilighting.com/cRC-DI.pdf",
        "aliases": [],
    },
}


def _existing_file(out_dir: Path, filename: str, aliases: list[str]) -> Path | None:
    for name in [filename, *aliases]:
        path = out_dir / name
        if path.exists() and path.stat().st_size > 0:
            return path
    return None


def _download_with_ssl_fallback(url: str, dest: Path) -> None:
    try:
        urllib.request.urlretrieve(url, str(dest))
        return
    except Exception as first_error:
        if "CERTIFICATE_VERIFY_FAILED" not in str(first_error):
            raise first_error

    context = ssl._create_unverified_context()
    with urllib.request.urlopen(url, context=context) as response:
        dest.write_bytes(response.read())


def download_all() -> None:
    out_dir = Path(settings.raw_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for filename, info in REAL_PDFS.items():
        url = info["url"]
        aliases = info.get("aliases", [])

        existing = _existing_file(out_dir, filename, aliases)

        if existing is not None:
            canonical = out_dir / filename

            if existing.name != filename and not canonical.exists():
                canonical.write_bytes(existing.read_bytes())
                print(f"  Already exists: {filename} (copied from {existing.name})")
            else:
                print(f"  Already exists: {filename}")

            continue

        try:
            print(f"  Downloading: {filename} ...")
            dest = out_dir / filename
            _download_with_ssl_fallback(url, dest)
            print(f"  Saved: {dest.name} ({dest.stat().st_size:,} bytes)")
        except Exception as exc:
            print(f"  FAILED: {filename} — {exc}")

    pdfs = sorted(out_dir.glob("*.pdf"))
    print(f"  Verified PDFs found: {len(pdfs)}")


if __name__ == "__main__":
    download_all()