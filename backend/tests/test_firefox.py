import configparser
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from social_downloader.authentication import ConnectionFailure
from social_downloader.firefox import connect, discover


class FirefoxProviderTests(unittest.TestCase):
    def profile(self,root):
        profile=Path(root)/"Profiles/test.default";profile.mkdir(parents=True)
        (Path(root)/"profiles.ini").write_text("[Profile0]\nName=Test profile\nIsRelative=1\nPath=Profiles/test.default\n",encoding="utf-8")
        db=sqlite3.connect(profile/"cookies.sqlite")
        db.execute("CREATE TABLE moz_cookies(name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,originAttributes TEXT)")
        db.executemany("INSERT INTO moz_cookies VALUES(?,?,?,?,?,?,?,?)",[("sessionid","selected-platform-secret",".instagram.com","/",4102444800,1,1,""),("sessionid","container-secret",".instagram.com","/",4102444800,1,1,"^userContextId=1"),("unrelated","other-site-secret",".unrelated.test","/",4102444800,1,1,"")])
        db.commit();db.close()
        return profile

    def test_discovery_returns_opaque_handles_without_cookie_reads(self):
        with tempfile.TemporaryDirectory() as root:
            profile=self.profile(root)
            with patch("social_downloader.firefox.sqlite3.connect",side_effect=AssertionError("Discovery must not read cookie stores")):
                entries=discover(root)
            self.assertEqual(entries[0]["name"],"Test profile")
            self.assertNotIn("path",entries[0]);self.assertEqual(len(entries[0]["id"]),64)

    def test_connection_reads_only_selected_platform_normal_store_and_never_writes(self):
        with tempfile.TemporaryDirectory() as root:
            profile=self.profile(root);before=(profile/"cookies.sqlite").read_bytes()
            with patch("social_downloader.firefox.verify_account",return_value={"account_id":"42","username":"test_user"}) as verify:
                result=connect("instagram",discover(root)[0]["id"],root)
            self.assertEqual([entry["value"] for entry in result["cookies"]],["selected-platform-secret"])
            self.assertEqual(before,(profile/"cookies.sqlite").read_bytes())
            verify.assert_called_once()

    def test_renderer_cannot_supply_a_cookie_database_path(self):
        with tempfile.TemporaryDirectory() as root:
            self.profile(root)
            with self.assertRaises(ConnectionFailure):connect("instagram","C:/arbitrary/cookies.sqlite",root)


if __name__=="__main__":unittest.main()
