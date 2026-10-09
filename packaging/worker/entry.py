"""PyInstaller entry point; packaged workers never depend on a user Python install."""
from social_downloader.worker import main

if __name__ == "__main__":
    raise SystemExit(main())
