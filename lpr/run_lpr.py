#!/usr/bin/env python3
"""Path-robust launcher (works even when the interpreter ignores PYTHONPATH/`-P`):

    python run_lpr.py run | selfcheck | demo | once --image x.jpg
    # or after `pip install -e .`:  lpr-cli <command>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lpr.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())