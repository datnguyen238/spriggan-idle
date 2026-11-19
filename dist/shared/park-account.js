/* Small account controls. The session bootstrap owns authentication and automatic saves. */
(() => {
  'use strict';
  const account = window.SprigganAccount;
  if (!account) return;
  const $ = id => document.getElementById(id);
  const status = $('park-account-status'), signOut = $('park-account-signout'), retry = $('park-account-retry');
  let busy = false;
  function render() {
    const user = account.getUser(), state = account.getState();
    $('park-account-name').textContent = user?.email || user?.name || 'Your Google account';
    if (!busy) status.textContent = account.getMessage();
    retry.hidden = !['offline','error'].includes(state?.status);
    retry.disabled = busy;signOut.disabled = busy;
  }
  signOut.addEventListener('click',async () => {
    if (busy) return;
    busy = true;status.textContent = 'Saving your progress and signing out…';render();
    try {await account.signOut();}
    catch {busy = false;render();status.textContent = 'Sign-out could not finish. Check your connection, then try again.';}
  });
  retry.addEventListener('click',async () => {
    if (busy) return;
    busy = true;status.textContent = 'Reconnecting…';render();
    let failed = false;
    try {await account.retry();}
    catch {failed = true;}
    finally {busy = false;render();}
    if (failed) status.textContent = 'Could not reconnect. Your progress is kept on this device.';
  });
  document.addEventListener('spriggan:account-state',render);
  render();
  if (new URL(location.href).searchParams.get('account') === '1') $('park-memory-toggle').click();
})();
