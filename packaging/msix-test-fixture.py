"""Create only an empty isolated MSIX catalog after the guarded host backup."""
import json,sqlite3,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];data=Path(sys.argv[1]).resolve();media=Path(sys.argv[2]).resolve()
if data.name!="com.saveddesk.desktop" or not media.is_relative_to(root/".cache/msix-host"):
 raise SystemExit("Unexpected isolated catalog or media location")
database=data/"prototype-catalog.db"
if database.exists():raise SystemExit("Refuse to overwrite an existing catalog")
data.mkdir(parents=True,exist_ok=True);media.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(database) as db:
 db.executescript((root/"desktop/src-tauri/migrations/001_prototype.sql").read_text())
 settings={"downloadFolder":str(media),"lowResource":True,"quality":"original","profile":"original","sidebarExpanded":True}
 db.execute("INSERT INTO settings(id,value) VALUES(1,?)",(json.dumps(settings),))
