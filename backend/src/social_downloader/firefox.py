"""Read selected Firefox profiles and only the explicitly approved platform rows."""
import configparser
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3

from .authentication import ConnectionFailure, verify_account


def profile_records(root=None):
    base=Path(root) if root else Path(os.environ.get("APPDATA", ""))/"Mozilla/Firefox"
    registry=base/"profiles.ini"
    if not registry.is_file(): return []
    if registry.stat().st_size>512*1024: raise ConnectionFailure("Firefox profile information is too large.")
    settings=configparser.ConfigParser(interpolation=None)
    settings.read(registry,encoding="utf-8")
    records=[]
    for section in settings.sections():
        if not section.startswith("Profile"): continue
        value=settings[section]
        location=value.get("Path", "")
        if not location: continue
        path=(base/location if value.get("IsRelative", "1")=="1" else Path(location)).resolve()
        if not path.is_dir(): continue
        identity=hashlib.sha256(str(path).casefold().encode()).hexdigest()
        records.append({"id":identity,"name":value.get("Name", "Firefox profile")[:100],"path":path})
        if len(records)>=50: break
    return records


def discover(root=None):
    return [{"id":profile["id"],"name":profile["name"]} for profile in profile_records(root)]


def connect(source, profile_id, root=None, test_origin=None):
    profiles=profile_records(root)
    profile=next((entry for entry in profiles if entry["id"]==profile_id),None)
    if profile is None: raise ConnectionFailure("This Firefox profile is no longer available. Choose a profile again.")
    from .browser_sessions import DOMAINS, approve_session
    domains=("instagram.com",".instagram.com","www.instagram.com") if source=="instagram" else ("x.com",".x.com","www.x.com","twitter.com",".twitter.com","www.twitter.com") if source=="x" else tuple(host for base in DOMAINS.get(source, ()) for host in (base,"."+base,"www."+base,".www."+base))
    if not domains: raise ConnectionFailure("Choose Instagram or X.")
    database=profile["path"]/"cookies.sqlite"
    if not database.is_file(): raise ConnectionFailure("Sign in to the account in this Firefox profile first, then reconnect.")
    try:
        # No database copy or all-site SELECT. Read-only WAL-aware access while Firefox runs.
        with closing(sqlite3.connect(database.as_uri()+"?mode=ro",uri=True,timeout=2)) as connection:
            rows=connection.execute("SELECT name,value,host,path,expiry,isSecure,isHttpOnly,originAttributes FROM moz_cookies WHERE host IN ("+",".join("?" for _ in domains)+") LIMIT 201",domains).fetchall()
        cookies=[]
        for name,value,domain,path,expiry,secure,http_only,attributes in rows:
            if attributes:
                # Firefox containers/partitioned stores are separate identities. Never
                # silently mix them into the normal profile's session.
                continue
            cookies.append({"name":name,"value":value,"domain":domain,"path":path,"expirationDate":expiry,"secure":bool(secure),"httpOnly":bool(http_only),"hostOnly":not domain.startswith(".")})
    except sqlite3.Error:
        raise ConnectionFailure("Firefox's session store is unavailable or locked. Retry, or authorize the companion connector from that profile.") from None
    identity=approve_session(source,cookies) if source in DOMAINS else verify_account(source,cookies,test_origin=test_origin)
    return {**identity,"cookies":cookies,"profile_name":profile["name"]}
