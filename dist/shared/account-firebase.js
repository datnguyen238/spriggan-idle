/* Firebase Auth and revision-checked cloud saves. The site remains on its current host. */
(function (root, factory) {
  const scriptURL = root.document?.currentScript?.src;
  const api = factory(root, scriptURL);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SprigganFirebaseProvider = api;
})(globalThis, function (root, scriptURL) {
  'use strict';

  const SDK_VERSION = '13.1.0';
  const SAVE_KEYS = Object.freeze([
    'spriggan.pond.v1', 'spriggan.farm.v1', 'spriggan.slots.v1',
    'spriggan.dumplings.v1', 'spriggan.hex.totals.v1'
  ]);
  const MAX_BYTES = 450000;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function publicUser(user) {
    return user ? { uid: user.uid, email: user.email || '', emailVerified: user.emailVerified === true } : null;
  }

  function validateEntries(entries) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw fail('account/invalid-save', 'The saved worlds could not be read.');
    }
    const clone = {};
    for (const key of Object.keys(entries)) {
      if (!SAVE_KEYS.includes(key) || typeof entries[key] !== 'string') {
        throw fail('account/invalid-save', 'The saved worlds contain an unsupported entry.');
      }
      try { JSON.parse(entries[key]); }
      catch { throw fail('account/invalid-save', 'A saved world could not be read.'); }
      clone[key] = entries[key];
    }
    if (new TextEncoder().encode(JSON.stringify(clone)).length > MAX_BYTES) {
      throw fail('account/save-too-large', 'These worlds are too large for a cloud save.');
    }
    return clone;
  }

  function validateSave(data) {
    if (!data || data.format !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
        !['format', 'revision', 'entries', 'updatedAt'].every(key => Object.hasOwn(data, key)) ||
        Object.keys(data).some(key => !['format', 'revision', 'entries', 'updatedAt'].includes(key))) {
      throw fail('account/invalid-save', 'This cloud save uses an unsupported format.');
    }
    return { entries: validateEntries(data.entries), revision: data.revision };
  }

  function createProvider(sdk, { auth, db, continueURL }) {
    const actionSettings = { url: continueURL, handleCodeInApp: false };

    function requireUser(uid, verified = false) {
      const user = auth.currentUser;
      if (!user) throw fail('account/no-user', 'Sign in to use your account.');
      if (uid !== undefined && uid !== user.uid) {
        throw fail('account/wrong-user', 'This save belongs to another account.');
      }
      if (verified && !user.emailVerified) {
        throw fail('account/verification-required', 'Verify your email before saving worlds to your account.');
      }
      return user;
    }

    function saveRef(uid) {
      requireUser(uid, true);
      return sdk.doc(db, 'users', uid, 'saves', 'current');
    }

    return {
      get currentUser() { return publicUser(auth.currentUser); },

      authReady() {
        return new Promise((resolve, reject) => {
          let unsubscribe = () => {};
          const done = fn => value => {
            fn(value);
            Promise.resolve().then(() => unsubscribe());
          };
          unsubscribe = sdk.onAuthStateChanged(auth, done(user => resolve(publicUser(user))), done(reject));
        });
      },

      subscribe(listener) {
        return sdk.onAuthStateChanged(auth, user => listener(publicUser(user)), error => listener(null, error));
      },

      async register(email, password) {
        const result = await sdk.createUserWithEmailAndPassword(auth, email.trim(), password);
        return publicUser(result.user);
      },

      async signIn(email, password) {
        const result = await sdk.signInWithEmailAndPassword(auth, email.trim(), password);
        return publicUser(result.user);
      },

      signOut(expectedUid) {
        if (expectedUid !== undefined) requireUser(expectedUid);
        return sdk.signOut(auth);
      },

      sendVerification() {
        const user = requireUser();
        return user.emailVerified ? Promise.resolve() : sdk.sendEmailVerification(user, actionSettings);
      },

      async refreshUser() {
        const user = requireUser();
        await sdk.reload(user);
        requireUser(user.uid);
        await sdk.getIdToken(user, true);
        return publicUser(requireUser(user.uid));
      },

      resetPassword(email) { return sdk.sendPasswordResetEmail(auth, email.trim(), actionSettings); },

      async reauthenticate(password) {
        const user = requireUser();
        if (!user.email) throw fail('account/no-email', 'This account has no email address.');
        const credential = sdk.EmailAuthProvider.credential(user.email, password);
        const result = await sdk.reauthenticateWithCredential(user, credential);
        requireUser(user.uid);
        return publicUser(result.user);
      },

      deleteUser(expectedUid) { return sdk.deleteUser(requireUser(expectedUid)); },

      async readSave(uid) {
        const ref = saveRef(uid);
        const snapshot = await sdk.getDocFromServer(ref);
        requireUser(uid, true);
        return snapshot.exists() ? validateSave(snapshot.data()) : null;
      },

      async writeSave(uid, entries, expectedRevision) {
        const ref = saveRef(uid);
        const payload = validateEntries(entries);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw fail('account/invalid-revision', 'The save revision could not be read.');
        }
        return sdk.runTransaction(db, async transaction => {
          requireUser(uid, true);
          const snapshot = await transaction.get(ref);
          requireUser(uid, true);
          const actualRevision = snapshot.exists() ? validateSave(snapshot.data()).revision : 0;
          if (actualRevision !== expectedRevision) {
            throw fail('account/conflict', 'Another device has a newer save. Choose which worlds to keep.');
          }
          const revision = actualRevision + 1;
          transaction.set(ref, { format: 1, entries: payload, revision, updatedAt: sdk.serverTimestamp() });
          return revision;
        });
      },

      async deleteSave(uid) {
        requireUser(uid);
        // Account cleanup remains possible if a previously verified identity becomes unverified.
        await sdk.deleteDoc(sdk.doc(db, 'users', uid, 'saves', 'current'));
      }
    };
  }

  async function connect(config) {
    if (!config || ['apiKey', 'authDomain', 'projectId', 'appId'].some(key => typeof config[key] !== 'string' || !config[key].trim())) {
      throw fail('account/not-configured', 'Accounts are being set up. You can keep playing as a guest.');
    }
    const base = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
    const [appSDK, authSDK, firestoreSDK] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
    ]);
    const name = 'spriggan-accounts';
    const existing = appSDK.getApps().find(app => app.name === name);
    if (existing && existing.options.projectId !== config.projectId) {
      throw fail('account/wrong-project', 'Reload the page to connect the account service.');
    }
    const app = existing || appSDK.initializeApp(config, name);
    const auth = authSDK.getAuth(app);
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    const db = firestoreSDK.getFirestore(app);
    const continueURL = new URL('../account/', scriptURL || new URL('/shared/account-firebase.js', root.location.href)).href;
    return createProvider({ ...authSDK, ...firestoreSDK }, { auth, db, continueURL });
  }

  return { SDK_VERSION, connect, createProvider, validateEntries, validateSave };
});
