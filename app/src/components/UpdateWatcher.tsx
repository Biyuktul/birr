import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/* An installed app on iOS can sit in the background for days and never ask
   whether there is a newer build, so a fix can sit undelivered while the
   phone shows a months-old screen. This nudges it to check whenever the app
   comes back to the foreground, and hourly while it is open. */
export default function UpdateWatcher() {
  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const check = () => { void registration.update(); };

      const onVisible = () => { if (document.visibilityState === 'visible') check(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      const timer = window.setInterval(check, 60 * 60 * 1000);

      (window as unknown as { __birrStopUpdateChecks?: () => void }).__birrStopUpdateChecks = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', check);
        window.removeEventListener('online', check);
        window.clearInterval(timer);
      };
    },
  });

  useEffect(() => () => {
    (window as unknown as { __birrStopUpdateChecks?: () => void }).__birrStopUpdateChecks?.();
  }, []);

  // Belt and braces: registerType is 'autoUpdate', so a new build applies by
  // itself. This only matters if that ever fails to fire.
  useEffect(() => { void updateServiceWorker; }, [updateServiceWorker]);

  return null;
}
