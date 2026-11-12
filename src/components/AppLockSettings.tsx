import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { Btn, Card, Field, Select, Sheet, Toggle } from './ui';
import { toast } from '../lib/toast';
import {
  LOCK_TIMEOUTS,
  loadLockSettings,
  saveLockSettings,
  type AppLockSettings as LockSettings,
  type LockTimeout,
} from '../lib/appLock';
import {
  authenticateWithBiometrics,
  getBiometricAvailability,
  type BiometricAvailability,
} from '../lib/biometric';

export function AppLockSettings() {
  const [settings, setSettings] = useState<LockSettings>(loadLockSettings);
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getBiometricAvailability().then(setAvailability);
  }, []);

  const persist = (next: LockSettings) => {
    saveLockSettings(next);
    setSettings(next);
  };

  const enable = async () => {
    setExplainOpen(false);
    setBusy(true);
    try {
      const support = await getBiometricAvailability();
      setAvailability(support);
      if (!support.available) {
        toast(support.reason || 'Set a secure screen lock on this device first.', 'error');
        return;
      }
      const result = await authenticateWithBiometrics();
      if (!result.success) {
        if (result.code !== 'CANCELED') {
          toast(result.message || 'Authentication failed.', 'error');
        }
        return;
      }
      persist({ ...settings, enabled: true });
      toast('App lock enabled');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const support = await getBiometricAvailability();
      setAvailability(support);
      if (support.available) {
        const result = await authenticateWithBiometrics();
        if (!result.success) {
          if (result.code !== 'CANCELED') {
            toast(result.message || 'Authentication failed.', 'error');
          }
          return;
        }
      }
      persist({ ...settings, enabled: false });
      toast('App lock turned off');
    } finally {
      setBusy(false);
    }
  };

  const availableLabel = availability == null
    ? 'Checking device security…'
    : availability.available
      ? availability.biometric
        ? 'Fingerprint or face, with device PIN fallback'
        : 'Device PIN, pattern or password'
      : 'No secure screen lock on this device';

  return (
    <Card>
      <div className="spread">
        <div className="hstack">
          <span className="list-row__icon"><Fingerprint size={18} /></span>
          <div>
            <h2 className="card-title">App lock</h2>
            <p className="card-sub">Protect Finora when you step away</p>
          </div>
        </div>
        <span className={`pill ${availability?.available ? 'pill--ok' : 'pill--muted'}`}>
          {settings.enabled ? 'On' : 'Off'}
        </span>
      </div>

      <Toggle
        checked={settings.enabled}
        disabled={busy}
        onChange={(next) => {
          if (next) setExplainOpen(true);
          else void disable();
        }}
        label="Require authentication to open Finora"
        description={availableLabel}
      />

      {settings.enabled ? (
        <>
          <Field label="Lock after" hint="Finora locks after this much inactivity or time away.">
            <Select
              value={String(settings.timeout)}
              onChange={(event) => persist({ ...settings, timeout: Number(event.target.value) as LockTimeout })}
            >
              {LOCK_TIMEOUTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Toggle
            checked={settings.lockOnBackground}
            onChange={(next) => persist({ ...settings, lockOnBackground: next })}
            label="Lock as soon as Finora goes to the background"
            description="When off, the timeout above still applies while Finora is away."
          />
          <div className="hstack tiny muted">
            <ShieldCheck size={13} />
            Back never dismisses the lock. Your current screen is restored after unlocking.
          </div>
        </>
      ) : (
        <div className="hstack tiny muted">
          <KeyRound size={13} />
          Uses Android’s secure biometric prompt. Fingerprints, face data and device PINs are never stored by Finora.
        </div>
      )}

      <Sheet
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        title="Turn on app lock?"
        subtitle="Finora will ask you to authenticate before opening"
        footer={
          <>
            <Btn variant="soft" onClick={() => setExplainOpen(false)} disabled={busy}>Not now</Btn>
            <Btn onClick={() => void enable()} loading={busy}>Continue</Btn>
          </>
        }
      >
        <div className="confirm-body">
          <p>
            Finora uses Android’s official biometric prompt. You can unlock with an enrolled fingerprint,
            supported face authentication, or your device PIN, pattern or password.
          </p>
          <p>
            Your biometric data never leaves Android’s secure hardware, and Finora never receives or stores it.
            If device security is removed later, Finora lets you turn the lock off rather than trapping you outside.
          </p>
          <p className="hint">Your current screen is preserved when the app locks.</p>
        </div>
      </Sheet>
    </Card>
  );
}
