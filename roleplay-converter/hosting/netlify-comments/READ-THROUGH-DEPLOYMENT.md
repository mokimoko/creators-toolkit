# Shared read-through comments

RP Archiver added the Netlify Function in `netlify/functions` and the
`@netlify/blobs` dependency in `package.json` because at least one roleplay in
this site has Shared Read-Through enabled.

## Deploying

Deploy this folder through a Git-connected Netlify project or the Netlify CLI.
Netlify's drag-and-drop deploy does not build serverless Functions, so comments
cannot be shared when the folder is uploaded only as static files.

After deployment, open this URL to verify that the service exists:

`/api/read-through/comments?documentId=YOUR_DOCUMENT_ID`

The roleplay page and RP Archiver normally make this request automatically.
Comment data is kept in the site's `rp-read-through-comments` Netlify Blobs
store and persists across new site deploys.

## If RP Archiver reports a CORS error

A CORS error usually means Netlify served its normal 404 page instead of this
Function. Confirm that the deployed site includes `netlify/functions`, that its
root `package.json` includes `@netlify/blobs`, and that the site was deployed
through Git or the Netlify CLI. Then open the verification URL above again.

If the site itself is password-protected, sign in to the hosted site in the
same browser before pressing **Sync comments** in RP Archiver.
