"""Explicit browser approval, not a claim of remotely verified account identity."""
import hashlib
import json
from .authentication import ConnectionFailure, cookie_jar

DOMAINS = {"youtube": ("youtube.com",), "facebook": ("facebook.com",), "tiktok": ("tiktok.com",), "pinterest": ("pinterest.com",)}
REQUIRED = {"youtube": (("SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"),), "facebook": (("c_user",), ("xs",)), "tiktok": (("sessionid", "sessionid_ss"),), "pinterest": (("_pinterest_sess",), ("_auth",))}

def approve_session(source, cookies):
    if source not in DOMAINS:
        raise ConnectionFailure("This platform does not support browser-session approval.")
    jar = cookie_jar(source, cookies)
    values = {c.name:c.value for c in jar if c.value}
    if not all(any(values.get(name) for name in group) for group in REQUIRED[source]) or (source == "pinterest" and values.get("_auth") != "1"):
        raise ConnectionFailure("Sign in to this platform in the selected browser profile, then approve its session again.")
    # This names the approved credential set, not a verified provider account.
    # Credential rotation creates a separate scope; old jobs cannot use another session.
    credentials = sorted((c.domain,c.path,c.name,c.value) for c in jar if c.name in {name for group in REQUIRED[source] for name in group})
    identity = "session_" + hashlib.sha256(json.dumps([source,credentials],separators=(",",":")).encode()).hexdigest()
    return {"source":source,"account_id":identity,"username":"BrowserSession","state":"session_ready"}
