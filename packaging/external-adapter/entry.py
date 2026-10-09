"""MIT SavedDesk adapter source; third-party engines are installed by the user."""
import sys
from pathlib import Path
# Only SavedDesk's own sources are placed beside this entrypoint.
source=Path(__file__).resolve().parent
development=source.parents[1]/"backend"/"src"
sys.path.insert(0,str(source if (source/"social_downloader").is_dir() else development))
from social_downloader.worker import main
raise SystemExit(main())
