"""Scoped browser sessions; no credential files, engine config files, or logging."""
from http.cookiejar import Cookie
import re
import math
import time
from urllib.parse import unquote

import requests


class ConnectionFailure(ValueError):
    pass


class VerificationRouteUnavailable(ConnectionFailure):
    pass


def cookie_jar(source: str, cookies: list) -> requests.cookies.RequestsCookieJar:
    from .browser_sessions import DOMAINS
    domains = {"instagram.com"} if source == "instagram" else {"x.com", "twitter.com"} if source == "x" else set(DOMAINS.get(source, ()))
    if not domains or not isinstance(cookies, list) or not 1 <= len(cookies) <= 200:
        raise ConnectionFailure("The browser session is not valid. Connect again.")
    jar = requests.cookies.RequestsCookieJar()
    for entry in cookies:
        domain = entry.get("domain", "")
        name, value, path = entry.get("name", ""), entry.get("value", ""), entry.get("path", "/")
        if domain.lstrip(".").removeprefix("www.") not in domains or not re.fullmatch(r"[\w-]{1,100}", name) or not isinstance(value, str) or len(value) > 8192 or any(c in value for c in "\r\n\0") or not path.startswith("/") or len(path) > 1024:
            raise ConnectionFailure("The browser returned an unsupported session.")
        if entry.get("partitionKey") or entry.get("firstPartyDomain"):
            raise ConnectionFailure("This session uses a browser partition/container that is not supported yet.")
        expires = entry.get("expirationDate")
        if expires is not None and (not isinstance(expires, (int, float)) or expires < time.time()):
            continue
        jar.set_cookie(Cookie(0, name, value, None, False, domain, not entry.get("hostOnly", not domain.startswith(".")), domain.startswith("."), path, True,
                              bool(entry.get("secure", True)), int(expires) if expires else None, expires is None, None, None,
                              {"HttpOnly": entry.get("httpOnly", False), "SameSite": entry.get("sameSite", "unspecified")}, False))
    required = {"sessionid"} if source == "instagram" else {"auth_token", "ct0"} if source == "x" else set()
    if not required.issubset({c.name for c in jar}):
        raise ConnectionFailure("Sign in to this account in the selected browser, then connect again.")
    return jar


def _cookie_value(jar, name, preferred):
    for domain in preferred:
        for cookie in jar:
            if cookie.name == name and cookie.domain.lstrip(".") == domain:
                return cookie.value
    return ""


def browser_user_agent(value):
    if value is None:
        return None
    if not isinstance(value, str) or not 1 <= len(value) <= 512 or any(not 32 <= ord(c) <= 126 for c in value):
        raise ConnectionFailure("The browser returned an invalid client identity. Reload the connector and connect again.")
    return value


def _retry_after(value):
    # Only a bounded, validated delay is exposed. Never echo raw headers.
    if not isinstance(value, str) or len(value) > 128:
        return None
    if re.fullmatch(r"[0-9]{1,7}", value):
        seconds = int(value)
    else:
        from email.utils import parsedate_to_datetime
        try:
            instant = parsedate_to_datetime(value)
            if instant.tzinfo is None:
                return None
            seconds = math.ceil(instant.timestamp() - time.time())
        except (ValueError, TypeError, OverflowError):
            return None
    return seconds if 0 < seconds <= 30 * 86400 else None


def _rejected_request(response, label, stage):
    # Instagram sometimes returns HTTP 429 for a client mismatch instead of a
    # timed quota. Recognize only fixed reasons; private response text is discarded.
    import json
    body = {}
    try:
        data = bytearray()
        for chunk in response.iter_content(4096):
            data.extend(chunk)
            if len(data) > 16384:
                break
        if len(data) <= 16384:
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                body = parsed
    except (ValueError, UnicodeError, requests.RequestException):
        pass
    reason = body.get("message")
    if isinstance(reason, str) and reason.strip().casefold() in {"useragent mismatch", "user agent mismatch", "user-agent mismatch"}:
        return f"{label} rejected SavedDesk's client identity during {stage} (HTTP 429: useragent mismatch). This is a request compatibility problem; waiting alone may not fix it."
    if body.get("challenge") or body.get("checkpoint_url") or body.get("error_type") in ("checkpoint_required", "challenge_required"):
        return f"{label} requires a browser sign-in check during {stage} (HTTP 429). Open the platform in your selected browser profile and complete the check before reconnecting."
    delay = _retry_after(response.headers.get("Retry-After"))
    if delay:
        minutes = (delay + 59) // 60
        waiting = f"The server requests waiting at least {minutes} minute(s) before retrying."
    else:
        waiting = "No retry time was provided. If the platform works in your browser, SavedDesk's request may be incompatible; repeated reconnects will not diagnose it."
    return f"{label} rejected {stage} (HTTP 429). {waiting}"


def _instagram_request_state(client, headers, response=None):
    # Carry only actual provider-issued state between the authenticated settings
    # request and identity lookup. No fabricated claim or credential logging.
    csrf = _cookie_value(client.cookies, "csrftoken", ["instagram.com", "www.instagram.com"])
    if csrf:
        headers["X-CSRFToken"] = csrf
    if response is not None:
        claim = response.headers.get("x-ig-set-www-claim")
        if isinstance(claim, str) and 1 <= len(claim) <= 4096 and all(32 <= ord(c) <= 126 for c in claim):
            headers["X-IG-WWW-Claim"] = claim


def _account_json(client, url, headers, label, params=None, *, allow_list=False, stage="account verification"):
    # Only fixed provider endpoints are supplied by this module. Do not follow
    # redirects or echo response bodies/headers, which may contain private data.
    if label == "Instagram":
        _instagram_request_state(client, headers)
    with client.get(url, headers=headers, params=params, timeout=(5, 12),
                    allow_redirects=False, stream=True) as response:
        status = response.status_code
        if status == 401:
            raise ConnectionFailure(f"{label} did not accept this session (HTTP 401). Sign in in the selected browser profile, then reconnect.")
        if status == 403:
            raise ConnectionFailure(f"{label} denied account verification (HTTP 403). Complete any sign-in checks in your browser. If the browser works, the platform may be rejecting the app's request.")
        if status == 429:
            raise ConnectionFailure(_rejected_request(response, label, stage))
        if 300 <= status < 400:
            raise ConnectionFailure(f"{label} redirected account verification (HTTP {status}). The session was not accepted; finish signing in in the selected browser and reconnect.")
        if status != 200:
            if status in (404, 405, 410):
                raise VerificationRouteUnavailable(f"{label}'s account verification route is unavailable (HTTP {status}). An app compatibility update may be required.")
            raise ConnectionFailure(f"{label} rejected account verification (HTTP {status}). Retry later; if it persists, report this code.")
        data = bytearray()
        for chunk in response.iter_content(16384):
            data.extend(chunk)
            if len(data) > 1024 * 1024:
                raise ConnectionFailure(f"{label} returned an oversized account response. No account was connected.")
        import json
        try:
            body = json.loads(data)
        except (ValueError, UnicodeError):
            raise ConnectionFailure(f"{label} returned an unsupported account response (HTTP 200). It may require a browser sign-in check.") from None
        if allow_list and isinstance(body, list):
            return body
        if not isinstance(body, dict):
            raise ConnectionFailure(f"{label} returned an unsupported account response. No account was connected.")
        if body.get("status") == "fail" or body.get("errors") or body.get("challenge") or body.get("checkpoint_url"):
            raise ConnectionFailure(f"{label} did not approve account verification. Complete any sign-in checks in the browser, then reconnect.")
        if label == "Instagram":
            _instagram_request_state(client, headers, response)
        return body


def _identity(user, source):
    if not isinstance(user, dict):
        return "", ""
    identity = user.get("user_id") or user.get("username_id") or user.get("pk") or user.get("id_str") or user.get("id") or user.get("rest_id") or ""
    username = user.get("username") if source == "instagram" else user.get("screen_name")
    identity = str(identity) if not isinstance(identity, bool) else ""
    pattern = r"[A-Za-z0-9._]{1,80}" if source == "instagram" else r"[A-Za-z0-9_]{1,30}"
    if not isinstance(username, str) or not re.fullmatch(pattern, username):
        return "", ""
    return identity if re.fullmatch(r"[0-9]{1,30}", identity) else "", username



def _instagram_session_account(jar):
    # This is an untrusted candidate until the exact credential has succeeded on
    # the authenticated settings route. Do not derive an identity from ds_user_id
    # alone, a public profile, an arbitrary numeric prefix, or duplicate sessions.
    route = "/api/v1/accounts/edit/web_form_data/"
    tokens = {cookie.value for cookie in jar if cookie.name == "sessionid"
              and cookie.domain.lstrip(".") in ("instagram.com", "www.instagram.com")
              and (route == cookie.path or route.startswith(cookie.path.rstrip("/") + "/"))}
    if len(tokens) != 1:
        return ""
    token = unquote(next(iter(tokens)))
    match = re.fullmatch(r"([1-9][0-9]{0,29}):[A-Za-z0-9_-]+:[0-9]{1,10}:[A-Za-z0-9_-]+", token)
    return match[1] if match and 30 < len(token) <= 8192 else ""


def _x_current_account(body, jar):
    # The authenticated multi-account route supports both response generations.
    # Never assume the first linked account is the one selected in the browser.
    entries = body.get("users") if isinstance(body, dict) else body
    if not isinstance(entries, list) or not 1 <= len(entries) <= 200:
        raise ConnectionFailure("X did not confirm an authenticated current account. No account was connected.")
    users = [entry.get("user", entry) if isinstance(entry, dict) else None for entry in entries]
    identities = [_identity(user, "x") for user in users]
    if any(not identity or not username for identity, username in identities):
        raise ConnectionFailure("X returned an unsupported signed-in account identity. No account was connected.")
    if len({identity for identity, _ in identities}) != len(identities):
        raise ConnectionFailure("X returned an ambiguous signed-in account list. No account was connected.")
    hint = _cookie_value(jar, "twid", ["x.com", "www.x.com"])
    if hint:
        match = re.fullmatch(r'u=([0-9]{1,30})', unquote(hint).strip('"'))
        matches = [user for user, (identity, _) in zip(users, identities) if match and identity == match[1]]
        if len(matches) != 1:
            raise ConnectionFailure("X could not match your active browser account to its signed-in account list. Open X in this browser profile, select the account you want, then reconnect.")
        return matches[0]
    if len(users) != 1:
        raise ConnectionFailure("Several X accounts are signed in, but the active account could not be identified. Open X in this browser profile, select the account you want, then reconnect.")
    return users[0]


def verify_account(source: str, cookies: list, session=None, test_origin=None, user_agent=None) -> dict:
    """Authenticate provider self-account routes; standard Instagram sessions need one request.

    Never accept cookie IDs, a public profile, or a successful HTTP code alone as
    proof of a connected account. All credential-bearing requests stay private.
    """
    client = session or requests.Session()
    owned = session is None
    try:
        user_agent = browser_user_agent(user_agent)
        client.trust_env = False
        client.cookies = cookie_jar(source, cookies)
        label = "Instagram" if source == "instagram" else "X"
        client.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"})
        if source == "instagram":
            from gallery_dl.util import USERAGENT_CHROME
            client.headers.update({"User-Agent": user_agent or USERAGENT_CHROME})
            root = "https://www.instagram.com"
            headers = {"Accept": "application/json", "Referer": root + "/", "Origin": root,
                       "X-IG-App-ID": "936619743392459", "X-ASBD-ID": "359341", "X-Requested-With": "XMLHttpRequest",
                       "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"}
            csrf = _cookie_value(client.cookies, "csrftoken", ["instagram.com", "www.instagram.com"])
            if csrf:
                headers["X-CSRFToken"] = csrf
            url = root + "/api/v1/accounts/edit/web_form_data/"
        else:
            # Reuse the pinned engine's browser bearer/CSRF compatibility set.
            from .live import configured_extractor
            extr = configured_extractor(source, "https://x.com/i/bookmarks", cookies, None)
            api = extr.api
            headers = {key: value for key, value in api.headers.items() if value is not None}
            url = "https://x.com/i/api/1.1/account/multi/list.json"
        if test_origin is not None:
            from .test_support import loopback_origin
            url = loopback_origin(test_origin) + "/viewer/" + source
        session_account = _instagram_session_account(client.cookies) if source == "instagram" else ""
        body = _account_json(client, url, headers, label, allow_list=source == "x")
        current = (body.get("form_data") or body.get("user") or {}) if source == "instagram" else _x_current_account(body, client.cookies)
        identity, username = _identity(current, source)
        if not username:
            raise ConnectionFailure(f"{label} did not confirm an authenticated current account. No account was connected.")
        if source == "instagram" and session_account:
            # The self-account response has now verified the exact session token
            # and supplied the username. Its embedded numeric owner must match the
            # separately scoped browser hint (and any ID returned by the server).
            hint = _cookie_value(client.cookies, "ds_user_id", ["instagram.com", "www.instagram.com"])
            if not re.fullmatch(r"[1-9][0-9]{0,29}", hint) or hint != session_account or (identity and identity != session_account):
                raise ConnectionFailure("Instagram's session and account identity do not match. Select the intended signed-in browser profile and reconnect.")
            identity = session_account
        if not identity:
            # Resolve exactly the username returned by Instagram's authenticated
            # settings route, never a name supplied by cookies or the frontend.
            hint = _cookie_value(client.cookies, "ds_user_id", ["instagram.com", "www.instagram.com"])
            if hint and not re.fullmatch(r"[0-9]{1,30}", hint):
                raise ConnectionFailure("Instagram returned an unsupported browser account hint. Reconnect from the intended browser profile.")
            # The browser ID is only a lookup candidate. A successful self-account
            # response above and matching server ID/username below are mandatory.
            lookup = root + f"/api/v1/users/{hint}/info/" if hint else root + "/api/v1/users/web_profile_info/"
            params = None if hint else {"username": username}
            if test_origin is not None:
                lookup = loopback_origin(test_origin) + (f"/profile/instagram/by-id/{hint}" if hint else "/profile/" + source)
            resolved = _account_json(client, lookup, headers, label, params, stage="account ID lookup by numeric ID" if hint else "account ID lookup by username")
            user = resolved.get("user", {}) if hint else resolved.get("data", {}).get("user", {})
            identity, resolved_username = _identity(user, source)
            if not identity or (hint and identity != hint) or resolved_username.casefold() != username.casefold():
                raise ConnectionFailure(f"{label} returned a different or unsupported account identity. No account was connected.")
        return {"account_id": identity, "username": username}
    except ConnectionFailure:
        raise
    except requests.Timeout:
        raise ConnectionFailure("Account verification timed out. Check your connection and try again.") from None
    except requests.exceptions.SSLError:
        raise ConnectionFailure("A secure connection to the platform could not be established. Check your computer's clock and network settings.") from None
    except requests.ConnectionError:
        raise ConnectionFailure("SavedDesk could not reach the platform. Check your internet connection and try again.") from None
    except Exception:
        raise ConnectionFailure("Account verification returned an unsupported result. No account was connected; retry or report this verification failure.") from None
    finally:
        if owned:
            client.close()
