"""Package only redistributable runtime files, including the upstream MIT license."""

from datetime import datetime, timezone
from pathlib import Path
import json
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    version = metadata["project"]["version"]
    manifest = {
        "version": version,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "repository": "Afrody9387/nd-super-nodes",
    }
    files = [
        ROOT / name for name in (
            "__init__.py", "LICENSE", "requirements.txt", "pyproject.toml",
            "update.ps1", "update.sh", "README.md", "FORK_RELEASE_NOTES.md",
        )
    ]
    files.extend((ROOT / "backend").rglob("*.py"))
    files.extend(p for p in (ROOT / "web").rglob("*") if p.is_file())
    output = ROOT / "dist" / f"nd-super-nodes-v{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(files):
            archive.write(file, str(file.relative_to(ROOT)).replace("\\", "/"))
        archive.writestr("version.json", json.dumps(manifest, indent=2) + "\n")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert "LICENSE" in archive.namelist()
        assert "web/extension.js" in archive.namelist()
        assert all("__pycache__" not in name for name in archive.namelist())
    print(f"Created {output.name} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
