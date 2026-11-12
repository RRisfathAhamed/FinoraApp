import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Btn } from './ui';
import { authenticateWithBiometrics, getBiometricAvailability, type BiometricAvailability } from '../lib/biometric';

export function AppLock({
  onUnlock,
  onDisable,
}: {
  onUnlock: () => void;
  onDisable: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const busyRef = useRef(false);

  const requestUnlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');

    const support = await getBiometricAvailability();
    setAvailability(support);
    if (!support.available) {
      busyRef.current = false;
      setBusy(false);
      setMessage(support.reason || 'No secure screen lock is configured on this device.');
      return;
    }

    const result = await authenticateWithBiometrics();
    busyRef.current = false;
    setBusy(false);
    if (result.success) {
      onUnlock();
      return;
    }
    if (result.code === 'LOCKOUT') {
      setMessage('Too many attempts. Wait for the device to allow another try, then unlock.');
    } else if (result.code === 'CANCELED') {
      setMessage('Unlock was cancelled. Tap below when you are ready.');
    } else {
      setMessage(result.message || 'Authentication could not be completed.');
    }
  }, [onUnlock]);


  const noAuthenticator = availability != null && !availability.available;
  const usesCredential = availability != null && availability.available && !availability.biometric && availability.credential;

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="Unlock Finora">
      <div className="app-lock__glow" aria-hidden />
      <div className="app-lock__grain" aria-hidden />

      <header className="app-lock__chrome">
        <span className="app-lock__brand">
          <span aria-hidden>F</span>
          Finora
        </span>
        <span className="app-lock__chip app-lock__chip--top">
          <Lock size={11} /> Locked
        </span>
      </header>

      <div className="app-lock__inner">
        <div className="app-lock__mark-wrap">
          <div className="app-lock__mark" aria-hidden>
            <span>F</span>
            <i />
          </div>
        </div>

        <p className="app-lock__eyebrow">SECURE SESSION</p>
        <h1>Welcome back</h1>
        <p className="app-lock__sub">Your money is safe. Unlock to pick up exactly where you left off.</p>

        <section className="app-lock__panel" aria-live="polite">
          <div className={`app-lock__icon ${busy ? 'app-lock__icon--busy' : ''}`}>
            {usesCredential ? <KeyRound size={27} /> : <Fingerprint size={30} />}
            <span className="app-lock__scan" aria-hidden />
          </div>

          <span className="app-lock__chip">
            <ShieldCheck size={12} /> Android protected
          </span>

          <p className="app-lock__prompt">
            {usesCredential ? 'Use your device PIN, pattern or password' : 'Unlock with fingerprint, face or device PIN'}
          </p>

          {message ? (
            <div className="app-lock__alert" role="status">
              <AlertCircle size={16} />
              <span>{message}</span>
            </div>
          ) : (
            <p className="app-lock__hint">Finora never receives or stores your biometric data.</p>
          )}

          <Btn
            className="app-lock__button"
            block
            loading={busy}
            onClick={() => void requestUnlock()}
          >
            {message ? 'Try again' : 'Unlock Finora'}
          </Btn>

          {noAuthenticator ? (
            <button type="button" className="app-lock__disable" onClick={onDisable}>
              Turn off app lock
            </button>
          ) : null}
        </section>

        <div className="app-lock__trust">
          <span><ShieldCheck size={14} /> Biometrics never stored</span>
          <span><Lock size={14} /> No account details shown</span>
        </div>
      </div>
    </div>
  );
}
