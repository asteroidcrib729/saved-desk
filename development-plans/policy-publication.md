# Public policies and Google Cloud branding

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The root README is the complete installation/account/data-handling guide. Root policies explicitly state public-only scope and link it. Hosting and Google production branding remain separate actions.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current follow-up (0.2.10, 9 October 2026):** The app guidance and native/preview registry now exclude private Facebook/TikTok/Pinterest content and remove Pinterest OAuth prerequisites. Existing browser approvals remain available for supported public links; Instagram/X and YouTube playlist routes are preserved. Google lifecycle acceptance uses controlled native credentials and provider responses, as the owner explicitly requested, preserving the current live Google grant. See [scope and verification](scope-and-lifecycle-0.2.10.md) and [owner-reported X endurance](owner-x-endurance.md). Historical version results below retain their original scope.

Updated 9 October 2026. The owner requested public policy Markdown files at the project root and supplied the public maintainer/contact details. This is an explicit exception to the supporting-document directory rule.

## Created source documents

- [Privacy Policy](../PRIVACY_POLICY.md)
- [Terms of Service](../TERMS_OF_SERVICE.md)

Both identify Faraz Hussain as maintainer and use the owner-supplied public support email. The README links to both. The source audit explicitly allows only README.md, PRIVACY_POLICY.md and TERMS_OF_SERVICE.md outside development-plans and verifies that the new policy files are not ignored. Other supporting Markdown remains in development-plans.

The disclosures describe the current data processing, unchanged between 0.2.9 and 0.2.10: local library storage, unencrypted catalog/media, current-user DPAPI credentials, optional Google identity using openid/profile, separate approved browser sessions, no maintainer-operated cloud synchronization/analytics, disconnect versus revocation, retained data after uninstall and permanent reviewed deletion. They do not claim that planned OAuth media adapters, encrypted SQLite or recovery services are implemented.

Terms preserve MIT and third-party license rights. They do not relicense downloaded content or replace the existing dependency/Windows installer terms.

## Source publication

Keep both policy files in the public source repository. Git initialization, committing, pushing, website deployment and changing Google Cloud settings have not been performed by this documentation task.

After choosing the actual GitHub account, repository and default branch, their public repository URLs will follow this pattern:

~~~
https://github.com/OWNER/REPOSITORY/blob/BRANCH/PRIVACY_POLICY.md
https://github.com/OWNER/REPOSITORY/blob/BRANCH/TERMS_OF_SERVICE.md
~~~

Replace the path components with real values. Verify that each page opens without signing in and displays the complete document. Do not use local filesystem paths, private-repository links or a link to an unmerged branch as the public policy location.

## Google branding and hosting

Public repository files are useful source documents, but repository publication is not Google brand verification. Google's [brand verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) include ownership verification for the domains in consent-screen URLs, a publicly accessible application homepage and a privacy page on the homepage's domain.

A normal github.com file URL does not establish that the repository owner controls github.com. Do not assume that Google will accept those links for production brand verification. Personal/testing exceptions can have different verification requirements; they do not guarantee approval of a future public production app.

For production submission:

1. Choose a publicly accessible site whose ownership you can verify. GitHub Pages with an owner-controlled domain is one hosting option; no site is deployed by this task.
2. Publish a homepage identifying SavedDesk, describing its current desktop functionality and linking prominently to rendered privacy/terms pages on the same site.
3. Render the root Markdown policies without changing their substantive content. Ensure relative links also resolve on the hosted site, including the README and MIT license links. Keep the root files as the maintained source.
4. Verify the required site/domain ownership in Google Search Console using an account associated with the Google Cloud project.
5. On Google Auth Platform > Branding, use the actual public homepage, privacy and terms URLs and confirm the application name, maintainer/support contact and developer contact details.
6. Keep the declared permissions aligned with the implemented Google identity flow: openid/profile. Policy publication does not add download permissions or authorize new data uses.
7. Complete Google's applicable brand review and publish the verified branding. Repository publication, domain verification and Google's approval are distinct actions.

Google's [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) requires accurate data disclosures and updates/consent for new data uses. Update the policies and relevant application disclosures before enabling future provider services or collecting additional data.

## Validation and scope

Run the existing audit from the project root:

~~~powershell
& .venv/Scripts/python.exe packaging/audit-repository.py
~~~

It checks publishable candidates, ignore rules, version alignment, Markdown placement and local links. It does not certify legal compliance or guarantee Google approval.

Policy creation was a documentation-only change for 0.2.9. The later 0.2.10 scope/lifecycle cycle rebuilds the app and installer without adding OAuth scopes, servers or new data processing. The root policies remain source documents, not newly bundled installer resources; historical 0.2.9 artifact evidence is retained.
