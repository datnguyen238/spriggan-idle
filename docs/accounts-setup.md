# Enable accounts at the current Spriggan URL

The frontend continues to run on the existing Vercel deployment. Firebase supplies authentication and cloud saves; Firebase Hosting, a purchased domain, and a separate SMTP account are not needed for this email/password implementation.

Until Firebase is configured, the Account page explains that accounts are being set up and the existing guest worlds remain playable. No accounts are simulated locally.

## 1. Create the Firebase project

1. Sign into the [Firebase console](https://console.firebase.google.com/) with the Google account that should own Spriggan's backend. Create a project. Google Analytics is optional and is not used by this integration.
2. Start with the Spark plan for development. Review its [current quotas](https://firebase.google.com/pricing) before a public launch; no paid upgrade is required just to develop email/password accounts.
3. Under **Project settings → General → Your apps**, register a **Web app**. Do not enable Firebase Hosting. Copy the public `firebaseConfig` object.
4. Under **Authentication → Sign-in method**, enable **Email/Password**. The app uses passwords, not email-link sign-in.
5. Under **Authentication → Settings → Authorized domains**, add the site's exact current hostname, for example `your-existing-project.vercel.app`. Enter only the hostname, without `https://`, a path, or a port. Add `localhost` separately for development if needed; newer Firebase projects do not add it automatically. Add only preview hosts that you intend to trust.
6. Keep the generated `PROJECT_ID.firebaseapp.com` value of `authDomain`. It is an authentication service setting; it does not change the website's URL.

Firebase's default hosted action pages handle verification and password reset. Their Continue button returns to `/account/` on the current site. If a custom email action URL is already configured, restore Firebase's default action handler for this implementation. See [email action continue URLs](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions).

## 2. Create and protect the cloud database

1. Create a **Cloud Firestore Standard edition** database using its native/default database. Select a location appropriate for the expected players; the location cannot simply be changed later.
2. Start in production mode. Publish the exact contents of [firestore.rules](../firestore.rules) using **Firestore Database → Rules** before making accounts available.
3. Alternatively, with a Firebase CLI already installed and authenticated, deploy only the rules from the repository root:

   ```sh
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

   The supplied `firebase.json` contains only Firestore rules configuration. It does not deploy Firebase Hosting or move the Vercel site.

The only allowed document is `users/{uid}/saves/current`. Verified users can read, create, and update their own snapshot; other users are denied. An authenticated owner can delete their snapshot even if their email is currently unverified, so account deletion can clean up any older verified saves. New snapshots start at revision 1, updates increment by exactly one, and timestamps must come from the server. Rules allow only the five deliberate gameplay storage keys. Never replace these rules with public test-mode access.

## 3. Connect the existing frontend

Replace `firebase: null` in [account-config.js](../dist/shared/account-config.js) with the public Web app configuration:

```js
globalThis.SprigganAccountConfig = {
  firebase: {
    apiKey: 'YOUR_PUBLIC_WEB_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_WEB_APP_ID'
    // Keep other fields from Firebase's generated configuration if present.
  }
};
```

This object is intentionally visible to browsers. It is not an Admin SDK credential. Do not paste a service-account JSON key, private key, or backend secret here. Database rules, verified identities, and Firebase's authentication controls protect account data. The frontend imports only App, Auth and Firestore from Firebase's CDN, pinned to SDK 13.1.0; it does not load Firebase Analytics.

Deploy through the site's existing Vercel workflow. The homepage, worlds, and `/account/` remain at the existing URL. Do not change `vercel.json`, point DNS elsewhere, or enable Firebase Hosting.

## 4. Verify the live configuration

- Register a new account. Confirm that verification mail arrives and that the email link's Continue action returns to the existing site's Account page.
- Verify the address, then use the Account page's verification refresh control. An unverified account must not be able to upload or fetch cloud worlds.
- Perform a significant action, wait for Cloud saved, and confirm that a second browser signed into the same account can recover it without a manual save. Check a pond add/remove/rename, a completed feeding batch, a farm milestone, a kitchen sale/purchase, and slot outcomes. Confirm ordinary unchanged frames do not upload; periodic autosaving and Save to account remain available.
- Simulate a failed first cloud read in a fresh browser. Each game must show a loading error, accept no gameplay, and perform no default-world upload; retry must load the existing cloud worlds. An already cached world, including an intentionally empty pond, should remain playable offline.
- Request a password reset. Confirm that the Firebase page accepts the replacement password and returns to the existing site.
- Sign out, then sign into a second account. Guest worlds and the first account's cached worlds must remain separate.
- Edit worlds on two devices from the same cloud revision. The stale device must retain its local progress and offer an explicit conflict choice rather than silently overwrite the newer cloud save.
- In Firestore's Rules playground, verify denial for an unauthenticated request, an unverified owner's read/create/update, and a verified user requesting another UID's document. The owner-only delete exception intentionally permits cleanup by an unverified account. Verify denial for unsupported keys and nonincrementing revisions.

Games persist significant events locally before calling `SprigganAccounts.saveProgress()`. This requests an immediate verified-account checkpoint, batches same-turn events, and gives events arriving during an upload a trailing checkpoint. It never waits for unrelated ongoing animation writes to stop. Guests and unverified accounts stay local, and unloaded account worlds cannot upload defaults. Covered events include slot outcomes/refills, pond membership/names/committed settings and growth on return, farm milestones/removals, kitchen cooking/sales/seed purchases, and changed meadow totals. Feeding uses bounded local batches (900 ms in the pond, the next one-second farm rule save). Ordinary clock and animation changes retain the one-minute cloud fallback. Pond timestamps and nourishment reconstruct elapsed growth; the clock itself does not require a per-second cloud write. Slot wins retain their immediate checkpoint. Verified prize claims wait for a complete cloud snapshot containing the prize and its claim receipt before navigating, including a second upload if an earlier win-only upload was already in flight. A failed claim upload retains the local reward and offers a retry. Pending cached progress retries immediately after authentication on the next page. Page hiding or navigation also attempts a best-effort checkpoint; browser shutdown cannot guarantee network completion.

A fresh verified session cannot open games until its first cloud read succeeds. Loading failures offer a retry without creating or uploading default worlds; valid cached worlds remain playable offline. The pond waits for a complete frame before revealing its canvas and stops saving after a rendering failure.

Account worlds use separate local records so saves from different tabs cannot overwrite one another. Cloud uploads still assemble one complete snapshot. Upload receipts apply only to the saved-world generation they uploaded, preserving later edits and restored worlds. Guest imports wait for an active upload before reading its resulting revision, pause new uploads during the copy, and then synchronize the imported snapshot.

The Account link shows cloud-saved, pending, or device-only status. Unverified users and upload failures display explicit device-only warnings. A new private/incognito session can recover only confirmed cloud progress; closing the old private session can discard its local cache. These checkpoints supplement the one-minute throttle without uploading every one-second farm autosave. Firebase free quotas are shared across all players, so monitor Auth and Firestore usage. Review Firebase's built-in email rate limits before inviting a large group.

If an email reports an unauthorized continue URL, check the authorized hostname. If signup reports `operation-not-allowed`, enable Email/Password. If cloud access reports insufficient permissions, check email verification, refresh the auth token, and confirm that the supplied rules are published to the same project as the frontend config. A blocked CDN or offline device can prevent account initialization; local guest or cached worlds remain available according to the account controller's recovery state.

Cloud snapshots synchronize client-owned, free game progress. They are not a server-controlled payment ledger, do not establish that seeds were honestly earned, and do not enable paid top-ups.

Official references: [browser CDN setup](https://firebase.google.com/docs/web/alt-setup), [user management](https://firebase.google.com/docs/auth/web/manage-users), [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), and [rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).
