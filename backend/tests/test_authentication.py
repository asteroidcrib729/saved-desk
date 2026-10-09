import json
import unittest
from unittest.mock import Mock, patch
import requests

from social_downloader.authentication import ConnectionFailure, cookie_jar, verify_account


def cookies(source="instagram"):
    return [{"domain": ".instagram.com" if source == "instagram" else ".x.com", "name": name, "value": "synthetic-test-value", "path": "/", "secure": True, "httpOnly": True} for name in (["sessionid"] if source == "instagram" else ["auth_token", "ct0"])]


class AuthenticationTests(unittest.TestCase):
    def client(self, status=200, data=None):
        response = Mock(status_code=status, headers={})
        response.iter_content.return_value = [json.dumps(data if data is not None else {"user": {"pk": 42, "username": "fixture_user"}}).encode()]
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        client = Mock()
        client.get.return_value = response
        return client

    def test_only_scoped_cookie_domains_are_accepted(self):
        for domain in ["evil.test", ".facebook.com", ".instagram.com.evil.test"]:
            with self.subTest(domain=domain), self.assertRaises(ConnectionFailure):
                cookie_jar("instagram", [{**cookies()[0], "domain": domain}])
        jar = cookie_jar("instagram", cookies())
        self.assertTrue(next(iter(jar)).secure)
        self.assertTrue(next(iter(jar)).has_nonstandard_attr("HttpOnly"))

    def test_expired_partitioned_and_header_injection_sessions_are_rejected(self):
        for update in [{"expirationDate": 1}, {"partitionKey": {"topLevelSite": "https://test"}}, {"value": "bad\r\nheader"}]:
            with self.subTest(update=update), self.assertRaises(ConnectionFailure):
                cookie_jar("instagram", [{**cookies()[0], **update}])

    def test_connection_requires_authenticated_current_user_response(self):
        client = self.client()
        self.assertEqual(verify_account("instagram", cookies(), client), {"account_id": "42", "username": "fixture_user"})
        args, kwargs = client.get.call_args
        self.assertIn("/accounts/edit/web_form_data/", args[0])
        self.assertFalse(kwargs["allow_redirects"])
        self.assertFalse(client.trust_env)
        with self.assertRaises(ConnectionFailure):
            verify_account("instagram", cookies(), self.client(data={"public_profile": {"pk": 42, "username": "somebody"}}))

    def test_failures_are_actionable_and_never_echo_session_values(self):
        for code in [401,403,429,500,302]:
            with self.subTest(code=code), self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram", cookies(), self.client(status=code))
            self.assertNotIn("synthetic-test-value", str(failure.exception))

    def test_cookie_presence_alone_never_means_connected(self):
        client = self.client()
        client.get.side_effect = RuntimeError("secret-session-value in library exception")
        with self.assertRaises(ConnectionFailure) as failure:
            verify_account("instagram", cookies(), client)
        self.assertNotIn("secret-session-value", str(failure.exception))

    def test_x_verifies_identity_with_an_authenticated_endpoint(self):
        client = self.client(data={"users":[{"user_id":"73","screen_name":"fixture_x"}]})
        self.assertEqual(verify_account("x",cookies("x"),client)["account_id"],"73")
        self.assertIn("account/multi/list.json",client.get.call_args.args[0])


    def test_instagram_web_settings_include_csrf_and_same_origin_headers(self):
        values = cookies() + [{**cookies()[0], "name":"csrftoken", "value":"test-csrf"}]
        client = self.client(data={"form_data":{"user_id":"42","username":"fixture_user"}})
        self.assertEqual(verify_account("instagram",values,client)["account_id"],"42")
        headers = client.get.call_args.kwargs["headers"]
        self.assertEqual(headers["X-CSRFToken"],"test-csrf")
        self.assertEqual(headers["Referer"],"https://www.instagram.com/")

    def test_instagram_resolves_only_the_authenticated_settings_username(self):
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        resolved=self.client(data={"data":{"user":{"id":"42","username":"fixture_user"}}}).get.return_value
        client.get.side_effect=[client.get.return_value,resolved]
        identity=verify_account("instagram",cookies(),client)
        self.assertEqual(identity,{"account_id":"42","username":"fixture_user"})
        self.assertEqual(client.get.call_args.kwargs["params"],{"username":"fixture_user"})

    def test_x_accepts_legacy_authenticated_account_list(self):
        client=self.client(data=[{"user":{"id_str":"73","screen_name":"fixture_x"}}])
        self.assertEqual(verify_account("x",cookies("x"),client),{"account_id":"73","username":"fixture_x"})
        self.assertEqual(client.get.call_count,1)

    def test_x_selects_active_account_from_server_list_instead_of_first_entry(self):
        users=[{"user_id":"99","screen_name":"other_account"},{"user_id":"73","screen_name":"fixture_x"}]
        for hint in ["u%3D73", '\"u=73\"']:
            values=cookies("x")+[{**cookies("x")[0],"name":"twid","value":hint}]
            client=self.client(data={"users":users})
            with self.subTest(hint=hint):
                self.assertEqual(verify_account("x",values,client),{"account_id":"73","username":"fixture_x"})
            self.assertEqual(client.get.call_count,1)

    def test_x_cannot_connect_ambiguous_mismatched_or_cookie_only_accounts(self):
        users=[{"user_id":"99","screen_name":"other_account"},{"user_id":"73","screen_name":"fixture_x"}]
        for body,hint in [({"users":users},None),({"users":users},"u%3D100"),({"users":users},"invalid"),({"users":users[:1]},"u%3D73"),({"users":[]},"u%3D73"),({"users":users+users[:1]},"u%3D73"),({"users":[{"screen_name":"fixture_x"}]},None),({"data":{"user":{"id":"73","screen_name":"fixture_x"}}},"u%3D73"),({"screen_name":"fixture_x","id_str":"73"},None)]:
            values=cookies("x")+([{**cookies("x")[0],"name":"twid","value":hint}] if hint else [])
            client=self.client(data=body)
            with self.subTest(body=body,hint=hint),self.assertRaises(ConnectionFailure):
                verify_account("x",values,client)
            self.assertEqual(client.get.call_count,1)

    def test_public_profile_lookup_cannot_replace_or_change_authenticated_identity(self):
        for source in ["instagram","x"]:
            client=self.client(data={"form_data":{"username":"fixture_user"}} if source=="instagram" else {"screen_name":"fixture_x"})
            user={"id":"999","username":"somebody_else"} if source=="instagram" else {"result":{"rest_id":"999","core":{"screen_name":"somebody_else"}}}
            resolved=self.client(data={"data":{"user":user}}).get.return_value
            client.get.side_effect=[client.get.return_value,resolved]
            with self.subTest(source=source),self.assertRaises(ConnectionFailure):
                verify_account(source,cookies(source),client)
        client=self.client(data={"data":{"user":{"id":"42","username":"fixture_user"}}})
        with self.assertRaises(ConnectionFailure):verify_account("instagram",cookies(),client)
        self.assertEqual(client.get.call_count,1)

    def test_http_codes_are_preserved_without_echoing_private_response_data(self):
        for code in [302,400,401,403,404,405,410,429,500,503]:
            with self.subTest(code=code),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),self.client(status=code,data={"message":"private-response-secret"}))
            self.assertIn(f"HTTP {code}",str(failure.exception))
            self.assertNotIn("private-response-secret",str(failure.exception))
            self.assertNotIn("synthetic-test-value",str(failure.exception))

    def test_html_challenges_and_json_errors_never_become_connected(self):
        for data in [{"status":"fail","message":"private-response-secret"},{"errors":[{"message":"private-response-secret"}]},{"challenge":{"url":"private-response-secret"}}]:
            with self.subTest(data=data),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),self.client(data=data))
            self.assertNotIn("private-response-secret",str(failure.exception))
        client=self.client();client.get.return_value.iter_content.return_value=[b"<html>private-response-secret</html>"]
        with self.assertRaises(ConnectionFailure) as failure:verify_account("instagram",cookies(),client)
        self.assertNotIn("private-response-secret",str(failure.exception))

    def test_transport_timeouts_and_tls_failures_remain_safe(self):
        for error in [requests.Timeout("private-secret"),requests.exceptions.SSLError("private-secret"),requests.ConnectionError("private-secret")]:
            client=self.client();client.get.side_effect=error
            with self.subTest(error=type(error).__name__),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),client)
            self.assertNotIn("private-secret",str(failure.exception))


    def test_x_never_tries_an_alternate_after_auth_rejection_or_rate_limit(self):
        for code in [401,403,429]:
            client=self.client(status=code)
            with self.subTest(code=code),self.assertRaises(ConnectionFailure):
                verify_account("x",cookies("x"),client)
            self.assertEqual(client.get.call_count,1)

    def test_x_missing_routes_do_not_mark_account_connected(self):
        client=self.client(status=404)
        with self.assertRaises(ConnectionFailure) as failure:
            verify_account("x",cookies("x"),client)
        self.assertIn("HTTP 404",str(failure.exception))
        self.assertEqual(client.get.call_count,1)

    def test_instagram_uses_approved_browser_identity_for_both_private_requests(self):
        agent="Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36"
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        client.get.side_effect=[client.get.return_value,self.client(data={"data":{"user":{"id":"42","username":"fixture_user"}}}).get.return_value]
        self.assertEqual(verify_account("instagram",cookies(),client,user_agent=agent)["account_id"],"42")
        client.headers.update.assert_any_call({"User-Agent":agent})
        self.assertEqual(client.get.call_count,2)
        self.assertEqual(client.get.call_args.kwargs["headers"]["X-ASBD-ID"],"359341")

    def test_browser_identity_rejects_private_header_injection_before_network_access(self):
        for value in ["",42,"private-secret\r\nInjected: value","x"*513,"private-secret\x00"]:
            client=self.client()
            with self.subTest(value=value),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),client,user_agent=value)
            self.assertNotIn("private-secret",str(failure.exception))
            client.get.assert_not_called()

    def test_429_client_mismatch_is_not_mislabeled_as_a_timed_rate_limit(self):
        client=self.client(status=429,data={"message":"useragent mismatch","private":"private-secret"})
        with self.assertRaises(ConnectionFailure) as failure:
            verify_account("instagram",cookies(),client)
        self.assertIn("HTTP 429: useragent mismatch",str(failure.exception))
        self.assertIn("compatibility",str(failure.exception))
        self.assertNotIn("private-secret",str(failure.exception))
        self.assertEqual(client.get.call_count,1)

    def test_429_honors_validated_retry_after_without_echoing_private_values(self):
        for value in ["120","Thu, 01 Jan 1970 00:18:40 GMT"]:
            client=self.client(status=429,data={"message":"private-secret"})
            client.get.return_value.headers={"Retry-After":value}
            with patch("social_downloader.authentication.time.time",return_value=1000),self.subTest(value=value),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),client)
            self.assertIn("at least 2 minute(s)",str(failure.exception))
            self.assertNotIn("private-secret",str(failure.exception))
            self.assertEqual(client.get.call_count,1)

    def test_429_without_valid_retry_time_does_not_invent_a_cooldown(self):
        for value in [None,"private-secret","-20","999999999999", "0"]:
            client=self.client(status=429,data={"message":"private-secret"})
            client.get.return_value.headers={"Retry-After":value}
            with self.subTest(value=value),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),client)
            self.assertIn("No retry time was provided",str(failure.exception))
            self.assertNotIn("private-secret",str(failure.exception))
            self.assertNotIn("few minutes",str(failure.exception))

    def test_429_profile_lookup_is_identified_without_accepting_partial_identity(self):
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        client.get.side_effect=[client.get.return_value,self.client(status=429,data={"message":"useragent mismatch"}).get.return_value]
        with self.assertRaises(ConnectionFailure) as failure:
            verify_account("instagram",cookies(),client)
        self.assertIn("account ID lookup",str(failure.exception))
        self.assertIn("HTTP 429",str(failure.exception))
        self.assertEqual(client.get.call_count,2)

    def test_429_challenge_is_reported_as_browser_check(self):
        client=self.client(status=429,data={"error_type":"challenge_required","message":"private-secret"})
        with self.assertRaises(ConnectionFailure) as failure:
            verify_account("instagram",cookies(),client)
        self.assertIn("requires a browser sign-in check",str(failure.exception))
        self.assertNotIn("private-secret",str(failure.exception))

    def test_429_malformed_or_oversized_diagnostics_remain_bounded_and_safe(self):
        for chunks in [[b"<html>private-secret</html>"],[b"x"*17000],[b'{"message":"private-secret"}']]:
            client=self.client(status=429)
            client.get.return_value.iter_content.return_value=chunks
            with self.subTest(size=len(chunks[0])),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",cookies(),client)
            self.assertIn("HTTP 429",str(failure.exception))
            self.assertNotIn("private-secret",str(failure.exception))

    def test_instagram_resolves_browser_id_only_after_authenticated_username_is_confirmed(self):
        values=cookies()+[{**cookies()[0],"name":"ds_user_id","value":"42"}]
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        client.get.side_effect=[client.get.return_value,self.client(data={"user":{"pk":42,"username":"fixture_user"}}).get.return_value]
        self.assertEqual(verify_account("instagram",values,client),{"account_id":"42","username":"fixture_user"})
        self.assertEqual(client.get.call_args.args[0],"https://www.instagram.com/api/v1/users/42/info/")
        self.assertIsNone(client.get.call_args.kwargs["params"])
        self.assertEqual(client.get.call_count,2)
        self.assertFalse(any("web_profile_info" in call.args[0] for call in client.get.call_args_list))

    def test_instagram_browser_id_cannot_replace_authenticated_or_matching_server_identity(self):
        values=cookies()+[{**cookies()[0],"name":"ds_user_id","value":"42"}]
        for user in [{"pk":999,"username":"fixture_user"},{"pk":42,"username":"somebody_else"},{"username":"fixture_user"}]:
            client=self.client(data={"form_data":{"username":"fixture_user"}})
            client.get.side_effect=[client.get.return_value,self.client(data={"user":user}).get.return_value]
            with self.subTest(user=user),self.assertRaises(ConnectionFailure):
                verify_account("instagram",values,client)
        client=self.client(data={"public_profile":{"pk":42,"username":"fixture_user"}})
        with self.assertRaises(ConnectionFailure):verify_account("instagram",values,client)
        self.assertEqual(client.get.call_count,1)

    def test_instagram_by_id_rejection_never_falls_back_to_rejected_username_route(self):
        values=cookies()+[{**cookies()[0],"name":"ds_user_id","value":"42"}]
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        client.get.side_effect=[client.get.return_value,self.client(status=429).get.return_value]
        with self.assertRaises(ConnectionFailure) as failure:verify_account("instagram",values,client)
        self.assertIn("account ID lookup",str(failure.exception))
        self.assertEqual(client.get.call_count,2)
        self.assertFalse(any("web_profile_info" in call.args[0] for call in client.get.call_args_list))

    def test_instagram_invalid_browser_id_is_never_used_in_a_request_url(self):
        for hint in ["42/evil","../42","private-secret","9"*31]:
            values=cookies()+[{**cookies()[0],"name":"ds_user_id","value":hint}]
            client=self.client(data={"form_data":{"username":"fixture_user"}})
            with self.subTest(hint=hint),self.assertRaises(ConnectionFailure) as failure:verify_account("instagram",values,client)
            self.assertNotIn(hint,str(failure.exception))
            self.assertEqual(client.get.call_count,1)

    def test_instagram_retains_server_claim_and_rotated_csrf_before_lookup(self):
        values=cookies()+[{**cookies()[0],"name":"ds_user_id","value":"42"},{**cookies()[0],"name":"csrftoken","value":"old-private-csrf"}]
        client=self.client(data={"form_data":{"username":"fixture_user"}})
        first=client.get.return_value
        first.headers={"x-ig-set-www-claim":"synthetic-private-claim"}
        second=self.client(data={"user":{"pk":42,"username":"fixture_user"}}).get.return_value
        seen=[]
        def get(url,**options):
            seen.append(dict(options["headers"]))
            if len(seen)==1:
                client.cookies.set("csrftoken","new-private-csrf",domain=".instagram.com",path="/")
                return first
            return second
        client.get.side_effect=get
        self.assertEqual(verify_account("instagram",values,client)["account_id"],"42")
        self.assertNotIn("X-IG-WWW-Claim",seen[0])
        self.assertEqual(seen[0]["X-CSRFToken"],"old-private-csrf")
        self.assertEqual(seen[1]["X-CSRFToken"],"new-private-csrf")
        self.assertEqual(seen[1]["X-IG-WWW-Claim"],"synthetic-private-claim")

    def test_instagram_does_not_forward_malformed_or_unbounded_server_claims(self):
        for claim in ["", "private-secret\r\nInjected: value", "x"*4097]:
            client=self.client(data={"form_data":{"username":"fixture_user"}})
            first=client.get.return_value;first.headers={"x-ig-set-www-claim":claim}
            second=self.client(data={"data":{"user":{"id":"42","username":"fixture_user"}}}).get.return_value
            client.get.side_effect=[first,second]
            with self.subTest(size=len(claim)):
                self.assertEqual(verify_account("instagram",cookies(),client)["account_id"],"42")
            self.assertNotIn("X-IG-WWW-Claim",client.get.call_args.kwargs["headers"])


    def standard_session(self, token="42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature", hint="42"):
        return [{**cookies()[0], "value":token}, {**cookies()[0], "name":"ds_user_id", "value":hint}]

    def test_instagram_verified_standard_session_avoids_all_profile_lookups(self):
        for token in ["42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature", "42:synthetic_private_token:10:synthetic_private_signature"]:
            client = self.client(data={"form_data":{"username":"fixture_user"}})
            with self.subTest(encoded="%3A" in token):
                self.assertEqual(verify_account("instagram",self.standard_session(token),client),{"account_id":"42","username":"fixture_user"})
            self.assertEqual(client.get.call_count,1)
            self.assertIn("/accounts/edit/web_form_data/",client.get.call_args.args[0])

    def test_instagram_standard_session_still_requires_authenticated_server_username(self):
        for status, body in [(401,{}),(403,{}),(429,{}),(200,{"public_profile":{"pk":42,"username":"fixture_user"}}),(200,{"form_data":{"username":""}}),(200,{"status":"fail","form_data":{"username":"fixture_user"}}),(200,{"challenge":{},"checkpoint_url":"private-secret"})]:
            client = self.client(status=status,data=body)
            with self.subTest(status=status,body=body),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",self.standard_session(),client)
            self.assertEqual(client.get.call_count,1)
            self.assertNotIn("synthetic_private",str(failure.exception))
            self.assertNotIn("private-secret",str(failure.exception))

    def test_instagram_standard_session_rejects_conflicting_account_hints_and_server_ids(self):
        for hint, body in [("99",{"form_data":{"username":"fixture_user"}}),("",{"form_data":{"username":"fixture_user"}}),("42/evil",{"form_data":{"username":"fixture_user"}}),("42",{"form_data":{"user_id":"99","username":"fixture_user"}})]:
            client = self.client(data=body)
            with self.subTest(hint=hint),self.assertRaises(ConnectionFailure) as failure:
                verify_account("instagram",self.standard_session(hint=hint),client)
            self.assertEqual(client.get.call_count,1)
            self.assertNotIn(hint if len(hint)>2 else "synthetic_private",str(failure.exception))

    def test_instagram_unknown_session_shapes_do_not_skip_server_id_resolution(self):
        for token in ["42", "42:anything", "42:short:10:x", "42%253Asynthetic_private_token%253A10%253Asynthetic_private_signature", "42:private:10:bad.signature"]:
            client = self.client(data={"form_data":{"username":"fixture_user"}})
            client.get.side_effect=[client.get.return_value,self.client(status=429).get.return_value]
            with self.subTest(token=token),self.assertRaises(ConnectionFailure):
                verify_account("instagram",self.standard_session(token),client)
            self.assertEqual(client.get.call_count,2)

    def test_instagram_conflicting_or_nonapplicable_sessions_cannot_supply_numeric_identity(self):
        from social_downloader.authentication import _instagram_session_account, cookie_jar
        values=self.standard_session()
        self.assertEqual(_instagram_session_account(cookie_jar("instagram",values)),"42")
        second={**values[0],"domain":"www.instagram.com","value":"99:synthetic_private_token:10:synthetic_private_signature"}
        self.assertEqual(_instagram_session_account(cookie_jar("instagram",values+[second])),"")
        self.assertEqual(_instagram_session_account(cookie_jar("instagram",[{**values[0],"path":"/unrelated/"},values[1]])),"")



if __name__ == "__main__": unittest.main()
