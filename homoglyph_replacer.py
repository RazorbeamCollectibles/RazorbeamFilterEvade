from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


DEPENDENCY_DIR = (
    Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    / "RazorbeamCollectibles"
    / "RazorbeamFilterEvade"
    / "python_deps"
)
if DEPENDENCY_DIR.exists():
    sys.path.insert(0, str(DEPENDENCY_DIR))


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


LOOKALIKE_MAP = str.maketrans(
    {
        "a": "\u0430",  # Cyrillic small a
        "A": "\u0410",  # Cyrillic capital A
        "c": "\u0441",  # Cyrillic small es
        "C": "\u0421",  # Cyrillic capital es
        "e": "\u0435",  # Cyrillic small ie
        "E": "\u0415",  # Cyrillic capital ie
        "i": "\u0456",  # Cyrillic small byelorussian-ukrainian i
        "I": "\u0406",  # Cyrillic capital byelorussian-ukrainian i
        "j": "\u0458",  # Cyrillic small je
        "J": "\u0408",  # Cyrillic capital je
        "o": "\u043e",  # Cyrillic small o
        "O": "\u041e",  # Cyrillic capital o
        "p": "\u0440",  # Cyrillic small er
        "P": "\u0420",  # Cyrillic capital er
        "s": "\u0455",  # Cyrillic small dze
        "S": "\u0405",  # Cyrillic capital dze
        "u": "\u057d",  # Armenian small seh
        "U": "\u054d",  # Armenian capital seh
        "x": "\u0445",  # Cyrillic small ha
        "X": "\u0425",  # Cyrillic capital ha
    }
)


def replace_letters(text: str) -> str:
    return text.translate(LOOKALIKE_MAP)


def copy_to_clipboard(text: str) -> bool:
    if sys.platform == "win32":
        subprocess.run("clip", input=text, text=True, check=True)
        return True

    if sys.platform == "darwin":
        subprocess.run("pbcopy", input=text, text=True, check=True)
        return True

    for command in ("wl-copy", "xclip", "xsel"):
        try:
            subprocess.run(command, input=text, text=True, check=True)
            return True
        except (FileNotFoundError, subprocess.CalledProcessError):
            pass

    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replace Latin lookalike characters with visually similar non-Latin glyphs."
    )
    parser.add_argument("text", nargs="*", help="Text to convert. If omitted, prompts for input.")
    parser.add_argument("-c", "--copy", action="store_true", help="Copy result to clipboard.")
    args = parser.parse_args()

    source = " ".join(args.text) if args.text else input("Text: ")
    result = replace_letters(source)
    print(result)

    if args.copy:
        if copy_to_clipboard(result):
            print("Copied to clipboard.")
        else:
            print("Could not copy to clipboard.", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

