# Facebook and TikTok authentication feasibility

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This is feasibility evidence for optional future identity, not a setup prerequisite or implemented private-media route. Both platforms currently support public links only.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Reviewed 9 October 2026 against official provider documentation.

## Decision and current application

The owner has excluded private content for Pinterest, Facebook and TikTok. Keep their supported public/shareable-link download adapters. Pinterest OAuth, secret-read scopes, secret-board pagination and restricted video-URL work are cancelled under this scope; the pending developer registration creates no further SavedDesk setup requirement. No cancellation was submitted to Pinterest.

Facebook and TikTok account sign-in are optional identity features to consider only if a distinct user benefit is selected. Neither basic login grant supplies extractor browser cookies or a downloadable media file. Public links do not require these new OAuth integrations. A platform may still reject an extraction, throttle it or require a browser session; account identity alone is not a fix for those problems.

Current runtime: Instagram/X verified connections and owner-confirmed private downloads work. Google Desktop identity is implemented, and the owner confirmed a two-video Watch Later download using separately approved YouTube browser credentials. Google OAuth does not currently authorize the downloader. Facebook/TikTok/Pinterest retain legacy browser-approval controls; these are not implemented official verified identities. The 0.2.10 app now implements truthful public-only provider/help guidance and removes Pinterest setup requirements. This does not add a universal content-visibility classifier.

## Comparison

| Area | Facebook identity only | TikTok identity only |
| --- | --- | --- |
| Product | Meta application with Facebook Login use case | TikTok developer app with Desktop Login Kit |
| Minimum permission | public_profile; omit optional email | user.info.basic; omit video.list unless a separate public-video listing feature is chosen |
| Desktop integration | Manual web/desktop authorization; validate the actual handoff and configured redirects before implementation | Documented localhost/127.0.0.1 HTTP/HTTPS callback with port and static path; wildcard port supported |
| Code exchange | Manual flow requires app secret, kept outside distributed desktop binaries | Secret-bearing exchange plus mandatory desktop PKCE with TikTok-specific encoding |
| Distribution | Inspect increased-access/live-mode/verification requirements for ordinary users | Sandbox for development; production review, verified website/policy URLs and end-to-end demo |
| Public pasted-media benefit | No demonstrated new media capability | No demonstrated new media capability |
| Assessment | Smaller permission set than abandoned Pinterest private-media work, but service and lifecycle work remain | Clear native callback specification, but significant production review and service obligations |

The effort assessment is an engineering inference, not provider approval. Public download compatibility remains the existing adapter's responsibility.

## Facebook requirements if identity is selected

1. Register a Meta developer application with the Facebook Login use case. Begin with required public_profile only; email and video/group/Page permissions are unnecessary for this scope.
2. Test under allowed developer/tester roles. Inspect permission access for users without app/business roles. Meta documents increased access and separate readiness/verification states. Business verification is conditional on the selected access/permission state; it is not universally required or universally waived.
3. Select and test the documented manual web/desktop authorization flow, supported redirects and system-browser-to-desktop handoff. Do not reuse Google's loopback flow without verifying Meta acceptance.
4. Implement an owner-controlled confidential exchange service for the documented app-secret exchange. Never ship the Meta app secret in Rust, JavaScript, environment files or executables. Agree hosting, domain, retention and operations before deployment.
5. Verify authenticated app-scoped identity and token/application context, actual grants, expiry, disconnect and deletion. Configure applicable policy, deauthorization and data-deletion handling.
6. Use no automatic SDK analytics. If an SDK is later chosen, review/disable automatic app-event collection or disclose it before release; current SavedDesk policies describe no developer analytics.
7. Accept identity only after successful and denied/cancelled login, wrong-app/token, expiry, disconnect and public-download regression tests. Request no private-video or group capabilities.

Sources: [Create an app](https://developers.facebook.com/documentation/facebook-login/create-an-app), [manual login flow](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow), [permissions](https://developers.facebook.com/documentation/facebook-login/guides/permissions), [Login overview](https://developers.facebook.com/documentation/facebook-login).

The official public pages were retrieved in a fresh isolated browser without owner credentials. Their manual-flow example uses Graph API v26.0; implementation must choose a currently supported version and record upgrades rather than treating this example as a perpetual pin.

## TikTok requirements if identity is selected

1. Register a TikTok developer app with Desktop and Login Kit. Sandbox supports development. Individual registration is documented; an organization is recommended rather than universally mandatory.
2. Provide an official website, Privacy Policy and Terms of Service. New apps must verify relevant URL ownership. Production review expects a functioning externally facing website with visibly linked policies and an end-to-end demo of every requested product/scope. Repository or policy Markdown files alone do not establish website compliance.
3. Start with user.info.basic. Do not request video.list merely to download a pasted link: it lists the authorized user's public videos. No Data Portability, followers-only, private-video, messaging or publishing feature is in scope.
4. Register the documented desktop loopback callback: localhost or 127.0.0.1, HTTP or HTTPS, port and static path; wildcard port is supported. A remote HTTPS callback is not an unconditional desktop requirement.
5. Implement authorization code plus mandatory PKCE, one-use state and cancellation. TikTok documents a hexadecimal SHA-256 S256 challenge; Google's base64url challenge must not be reused.
6. Provide secure server-side custody of the client secret and supported exchange/refresh lifecycle. A distributed desktop executable cannot keep a shared secret confidential. Agree service ownership/hosting, handoff security, retention and policies before deployment.
7. Submit accurate production review evidence and approved scopes. Validate stable app-scoped identity, refresh/disconnect and denied/expired grants, then run public-video/photo download regressions.

Sources: [Desktop Login Kit](https://developers.tiktok.com/docs/en/login-kit-desktop), [create an app](https://developers.tiktok.com/docs/en/getting-started-create-an-app), [app review guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines), [access tokens and scopes](https://developers.tiktok.com/docs/en/login-kit-manage-user-access-tokens).

## Recommended next step and owner actions

Continue public-link downloads without adding Facebook/TikTok OAuth merely for an account badge. Pinterest requires no further authentication work under the selected scope.

If a useful identity or authorized public-catalog feature is selected later, choose one provider, supply its public app/client identifier and approved product/scope details, and decide whether to operate the confidential service. Then implement against sandbox/test roles, update policies for actual server data processing, complete provider review and rebuild/test the affected app. Secrets, cookies and tokens must not be sent in chat or committed.

No private test links, private grants or Data Portability enrollment are requested. No registration, paid service, deployment, review submission or new OAuth implementation was performed in this feasibility review.
