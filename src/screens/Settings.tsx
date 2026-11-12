import { useEffect, useState } from 'react';
import {
  Bell,
  Camera,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  PhoneCall,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useApp, navigate } from '../lib/hooks';
import { AppLockSettings } from '../components/AppLockSettings';
import { actions, DEFAULT_DASHBOARD, store } from '../lib/store';
import {
  applyRestore,
  clearAllFinancialData,
  createBackup,
  readBackup,
  restoreSummary,
  type BackupProgress,
  type RestorePreview,
} from '../lib/backup';
import { downloadBlob, type FilePayload } from '../lib/files';
import { ImageCropper } from '../components/ImageCropper';
import {
  hasNativePermsBridge,
  nativeHasPermission,
  requestAllNativePermissions,
  requestNativePermission,
  type NativePermKey,
} from '../lib/nativePerms';
import { toast } from '../lib/toast';
import { formatDate, todayISO } from '../lib/calc';
import {
  Avatar,
  Btn,
  Card,
  Field,
  Input,
  Progress,
  Screen,
  Segmented,
  Select,
  Sheet,
  Toggle,
} from '../components/ui';

const SECTION_LABELS: Record<string, string> = {
  summary: 'Net worth summary',
  cashflow: 'Income and expenses',
  accounts: 'Accounts',
  upcoming: 'Upcoming obligations',
  progress: 'Savings and budgets',
  recent: 'Recent activity',
};

const CLEAR_PHRASE = 'CLEAR ALL';

function ClearDataSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const state = useApp();

  const close = () => {
    setText('');
    setReport(null);
    onClose();
  };

  const run = async () => {
    if (text.trim() !== CLEAR_PHRASE) return;
    setBusy(true);
    try {
      const result = clearAllFinancialData(store.state);
      store.replaceState(result.state);
      await store.flush();
      const summary = Object.entries(result.removed)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${count} ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
        .join(', ');
      setReport(summary || 'No financial records were present.');
      toast('All financial data cleared');
      setText('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Clear all financial data"
      subtitle="This cannot be undone without a backup"
      footer={
        <>
          <Btn variant="soft" onClick={close} disabled={busy}>Cancel</Btn>
          <Btn variant="danger" onClick={() => void run()} loading={busy} disabled={text.trim() !== CLEAR_PHRASE}>
            Clear data
          </Btn>
        </>
      }
    >
      <div className="confirm-body">
        <p><strong>Removed:</strong> accounts, transactions, transfers, salary jobs and records, loans, EMI payments, budgets, savings goals, investments, bills, bill payments, documents, receipts, account images, bank-message drafts and notification read state.</p>
        <p><strong>Retained:</strong> your name, contact details, profile photo, theme, currency, date and number formats, notification preferences and dashboard layout.</p>
        <p>Only records stored on this device are affected. These are {state.accounts.length} accounts, {state.transactions.length} transactions and {state.documents.length} documents right now.</p>
      </div>
      <Field label={`Type ${CLEAR_PHRASE} to confirm`}>
        <Input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" placeholder={CLEAR_PHRASE} />
      </Field>
      {report ? (
        <div className="banner banner--info"><span>Cleared successfully: {report}</span></div>
      ) : null}
      <p className="hint">Create a ZIP backup first if you may need this data later.</p>
    </Sheet>
  );
}

export function SettingsScreen() {
  const state = useApp();
  const [clearOpen, setClearOpen] = useState(false);
  const order = state.settings.dashboard.order.length ? state.settings.dashboard.order : DEFAULT_DASHBOARD;
  const hidden = state.settings.dashboard.hidden;

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    actions.settings.setDashboard({ order: next });
  };

  const toggleHidden = (key: string) => {
    actions.settings.setDashboard({
      hidden: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key],
    });
  };

  return (
    <Screen title="Settings" subtitle="Appearance, money, privacy and data" back>
      <Card>
        <h2 className="card-title">Appearance</h2>
        <p className="card-sub">Applied instantly, no save required</p>
        <Segmented
          ariaLabel="Theme"
          value={state.settings.theme}
          onChange={(theme) => actions.settings.setTheme(theme)}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
        <div className="hstack tiny muted">
          {state.settings.theme === 'system' ? <Monitor size={14} /> : state.settings.theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          {state.settings.theme === 'system'
            ? 'Follows your device appearance and reacts when it changes.'
            : `Finora always uses the ${state.settings.theme} theme.`}
        </div>
      </Card>

      <AppLockSettings />

      <Card>
        <h2 className="card-title">Money and formats</h2>
        <Field label="Primary currency">
          <Select value={state.settings.currency} onChange={(e) => actions.settings.update({ currency: e.target.value })}>
            {['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD', 'JPY', 'MYR', 'PKR'].map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date format">
          <Select
            value={state.settings.dateFormat}
            onChange={(e) => actions.settings.update({ dateFormat: e.target.value as typeof state.settings.dateFormat })}
          >
            <option value="DD MMM YYYY">DD MMM YYYY</option>
            <option value="MMM DD, YYYY">MMM DD, YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </Select>
        </Field>
        <Field label="Number format">
          <Select
            value={state.settings.numberFormat}
            onChange={(e) => actions.settings.update({ numberFormat: e.target.value as typeof state.settings.numberFormat })}
          >
            <option value="standard">1,234,567.89</option>
            <option value="indian">12,34,567.89</option>
          </Select>
        </Field>
        <Field label="Language">
          <Select value="en" disabled>
            <option value="en">English (device language)</option>
          </Select>
        </Field>
        <Toggle
          checked={state.settings.hideBalances}
          onChange={() => actions.settings.toggleBalancePrivacy()}
          label="Hide sensitive balances by default"
          description="Masks amounts across the app until you reveal them."
        />
      </Card>

      <Card>
        <h2 className="card-title">Notifications</h2>
        <Toggle checked={state.settings.notifySalary} onChange={(v) => actions.settings.update({ notifySalary: v })} label="Salary reminders" />
        <Toggle checked={state.settings.notifyEmi} onChange={(v) => actions.settings.update({ notifyEmi: v })} label="EMI and loan reminders" />
        <Toggle checked={state.settings.notifyBills} onChange={(v) => actions.settings.update({ notifyBills: v })} label="Bill reminders" />
        <Toggle checked={state.settings.notifyBudgets} onChange={(v) => actions.settings.update({ notifyBudgets: v })} label="Budget warnings" />
        <Toggle checked={state.settings.notifySavings} onChange={(v) => actions.settings.update({ notifySavings: v })} label="Savings milestones" />
        <Field label="Remind me this many days ahead">
          <Input
            type="number"
            min={0}
            max={30}
            value={state.settings.remindDays}
            onChange={(e) => actions.settings.update({ remindDays: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Btn variant="soft" size="sm" onClick={() => navigate('/notifications')}>Open notification centre</Btn>
      </Card>

      <Card>
        <h2 className="card-title">Dashboard</h2>
        <p className="card-sub">Reorder or hide home sections. Saved automatically.</p>
        {order.map((key, index) => (
          <div key={key} className="spread" style={{ padding: '6px 0' }}>
            <span className="small">{SECTION_LABELS[key] ?? key}</span>
            <span className="hstack">
              <button
                className="icon-btn icon-btn--plain"
                aria-label={`Move ${key} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                className="icon-btn icon-btn--plain"
                aria-label={`Move ${key} down`}
                disabled={index === order.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                className="icon-btn icon-btn--plain"
                aria-label={hidden.includes(key) ? `Show ${key}` : `Hide ${key}`}
                onClick={() => toggleHidden(key)}
              >
                {hidden.includes(key) ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </div>
        ))}
        <Btn variant="ghost" size="sm" onClick={() => actions.settings.setDashboard({ order: [...DEFAULT_DASHBOARD], hidden: [] })}>
          Reset dashboard
        </Btn>
      </Card>

      <Card>
        <h2 className="card-title">Data and privacy</h2>
        <div className="list">
          <button className="list-row" onClick={() => navigate('/backup')}>
            <span className="list-row__icon"><Database size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">Backup and restore</span>
              <span className="list-row__sub">ZIP archive with records and real media</span>
            </span>
          </button>
          <button className="list-row" onClick={() => navigate('/permissions')}>
            <span className="list-row__icon"><ShieldCheck size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title">Permissions</span>
              <span className="list-row__sub">Notifications, files and storage</span>
            </span>
          </button>
          <button className="list-row" onClick={() => setClearOpen(true)}>
            <span className="list-row__icon list-row__icon--danger"><Trash2 size={17} /></span>
            <span className="list-row__text">
              <span className="list-row__title text-danger">Clear all financial data</span>
              <span className="list-row__sub">Keeps your profile and preferences</span>
            </span>
          </button>
        </div>
        <div className="hstack tiny muted"><Lock size={13} /> Records stay in this device’s encrypted app storage; no Finora server receives them.</div>
      </Card>

      <Card>
        <h2 className="card-title">About Finora</h2>
        <p className="small muted">Version 1.1.0 · local-first personal finance</p>
        <p className="tiny muted">Your money, clearly managed.</p>
        <Btn variant="soft" size="sm" onClick={() => navigate('/help')}>Help and support</Btn>
      </Card>

      <Card className="developer-card">
        <div className="developer-card__head">
          <div className="developer-card__mark">RA</div>
          <div>
            <p className="card-title">Risfath Ahamed</p>
            <p className="card-sub">Designer &amp; developer of Finora</p>
          </div>
        </div>
        <p className="small muted">
          Finora is an independent, local-first finance app. Product design, engineering and the
          Android build are all made with care by Risfath Ahamed.
        </p>
        <div className="developer-card__meta">
          <span>Version 1.1.0</span>
          <span>Local-first</span>
          <span>Android · Web</span>
        </div>
      </Card>

      <ClearDataSheet open={clearOpen} onClose={() => setClearOpen(false)} />
    </Screen>
  );
}

export function ProfileScreen() {
  const state = useApp();
  const [name, setName] = useState(state.profile.name);
  const [email, setEmail] = useState(state.profile.email);
  const [phone, setPhone] = useState(state.profile.phone ?? '');
  const [avatar, setAvatar] = useState<FilePayload | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [occupation, setOccupation] = useState(state.profile.occupation ?? '');
  const [location, setLocation] = useState(state.profile.location ?? '');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const storedAvatar = !removeAvatar && state.profile.avatarId ? state.media[state.profile.avatarId]?.dataUrl : undefined;
  const preview = avatar?.dataUrl ?? storedAvatar;

  const pickAvatar = (file: File | undefined) => {
    if (!file) return;
    setError('');
    setPendingPhoto(file);
  };

  const save = () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      let avatarId = removeAvatar ? undefined : state.profile.avatarId;
      if (removeAvatar && state.profile.avatarId) actions.media.remove(state.profile.avatarId);
      if (avatar) {
        if (state.profile.avatarId && !removeAvatar) actions.media.remove(state.profile.avatarId);
        avatarId = actions.media.add({ name: avatar.name, mime: avatar.mime, size: avatar.size, dataUrl: avatar.dataUrl });
      }
      actions.profile.update({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        occupation: occupation.trim() || undefined,
        location: location.trim() || undefined,
        avatarId,
      });
      toast('Profile saved');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Profile" subtitle="Your identity in Finora" back>
      <Card>
        <div className="hstack" style={{ gap: 14 }}>
          <Avatar name={name} src={preview} size={68} />
          <div className="stack--tight" style={{ flex: 1 }}>
            <span className="small strong">{name || 'Your name'}</span>
            <span className="tiny muted">{email || 'No email yet'}</span>
          </div>
        </div>
        <div className="upload-actions">
          <label className="btn btn--soft btn--sm">
            <Camera size={15} /> {avatar ? 'Replace photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>
          {preview ? (
            <button className="btn btn--ghost btn--sm" onClick={() => { setAvatar(null); setRemoveAvatar(true); }}>
              Remove photo
            </button>
          ) : null}
        </div>
        <p className="hint">Photos are resized locally, saved on this device, and included in backups. No image is uploaded to a server.</p>
      </Card>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <Card>
        <h2 className="card-title">Contact details</h2>
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></Field>
        <Field label="Phone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" /></Field>
        <Field label="Occupation"><Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="What you do" /></Field>
        <Field label="City or country"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where you live" /></Field>
        <Btn onClick={save} loading={busy}>Save profile</Btn>
      </Card>

      {pendingPhoto ? (
        <ImageCropper
          file={pendingPhoto}
          round
          title="Profile photo"
          onCancel={() => setPendingPhoto(null)}
          onDone={(payload) => {
            setAvatar(payload);
            setRemoveAvatar(false);
            setPendingPhoto(null);
          }}
        />
      ) : null}

      <Card>
        <h2 className="card-title">Account security</h2>
        <p className="small muted">
          This local-first build has no Finora account or server session, so there is no password to change here.
          Protect your device with a screen lock and keep backups encrypted.
        </p>
        <Btn variant="soft" size="sm" onClick={() => navigate('/backup')}>Back up my data</Btn>
      </Card>

      <p className="tiny muted center">
        <User size={13} /> Profile information is retained when you clear financial data.
      </p>
    </Screen>
  );
}

export function PermissionsScreen() {
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported',
  );
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<string>('');
  const [nativeReady, setNativeReady] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<Record<string, boolean>>({});
  const [nativeBusy, setNativeBusy] = useState<NativePermKey | 'all' | null>(null);

  const refresh = () => {
    if ('Notification' in window) setNotif(window.Notification.permission);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    void navigator.storage?.estimate?.().then((value) => {
      if (value.usage != null) setEstimate(`${(value.usage / 1024 / 1024).toFixed(1)} MB used on this device`);
    }).catch(() => setEstimate(''));
    void refreshNative();
  };

  const refreshNative = async () => {
    const ready = hasNativePermsBridge();
    setNativeReady(ready);
    if (!ready) return;
    const keys: NativePermKey[] = ['notifications', 'sms', 'calls', 'camera', 'photos'];
    const entries = await Promise.all(
      keys.map(async (key) => [key, await nativeHasPermission(key)] as const),
    );
    setNativeStatus(Object.fromEntries(entries));
  };

  const allow = async (key: NativePermKey) => {
    if (!hasNativePermsBridge()) {
      toast('System permissions are only available in the Android app.', 'info');
      return;
    }
    setNativeBusy(key);
    const granted = await requestNativePermission(key);
    await refreshNative();
    setNativeBusy(null);
    toast(granted ? 'Permission granted' : 'Permission not granted', granted ? 'success' : 'info');
  };

  const allowAll = async () => {
    if (!hasNativePermsBridge()) {
      toast('Open the Android app to grant system permissions.', 'info');
      return;
    }
    setNativeBusy('all');
    await requestAllNativePermissions();
    await refreshNative();
    setNativeBusy(null);
    toast('Permissions updated');
  };

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const requestNotifications = async () => {
    if (hasNativePermsBridge()) {
      await allow('notifications');
      if ('Notification' in window) setNotif(window.Notification.permission);
      return;
    }
    if (!('Notification' in window)) {
      toast('This browser does not support notifications.', 'error');
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotif(result);
      toast(result === 'granted' ? 'Notifications allowed' : 'Notifications not allowed', result === 'granted' ? 'success' : 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const requestPersistent = async () => {
    try {
      if (!navigator.storage?.persist) {
        toast('Persistent storage is not supported by this browser.', 'info');
        return;
      }
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      toast(granted ? 'Storage marked persistent' : 'Browser declined persistent storage', granted ? 'success' : 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const permRows: { key: NativePermKey; title: string; sub: string; icon: JSX.Element }[] = [
    { key: 'notifications', title: 'Notifications', sub: 'Salary, EMI and bill reminders', icon: <Bell size={15} /> },
    { key: 'sms', title: 'Messages', sub: 'Detect bank transactions on this device', icon: <MessageSquare size={15} /> },
    { key: 'calls', title: 'Phone calls', sub: 'Call a bank or lender from a record', icon: <PhoneCall size={15} /> },
    { key: 'camera', title: 'Camera', sub: 'Capture receipts and profile photos', icon: <Camera size={15} /> },
    { key: 'photos', title: 'Photos', sub: 'Choose images to crop and attach', icon: <ImageIcon size={15} /> },
  ];

  return (
    <Screen title="Permissions" subtitle="What Finora needs and why" back>
      <Card className="perm-hero">
        <div className="perm-hero__head">
          <span className="perm-hero__icon"><ShieldCheck size={20} /></span>
          <div>
            <h2 className="card-title">App permissions</h2>
            <p className="card-sub">
              {nativeReady ? 'Tap any row to review or grant access' : 'Available in the Android app'}
            </p>
          </div>
        </div>
        <div className="perm-list">
          {permRows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="perm-row"
              onClick={() => void allow(row.key)}
              disabled={nativeBusy === row.key || nativeBusy === 'all'}
            >
              <span className="perm-row__icon">{row.icon}</span>
              <span className="perm-row__text">
                <span className="perm-row__title">{row.title}</span>
                <span className="perm-row__sub">{row.sub}</span>
              </span>
              <span className={`perm-row__state ${nativeStatus[row.key] ? 'perm-row__state--on' : ''}`}>
                {nativeStatus[row.key] ? 'Allowed' : 'Allow'}
              </span>
            </button>
          ))}
        </div>
        <Btn onClick={() => void allowAll()} loading={nativeBusy === 'all'} disabled={!nativeReady}>
          Allow all permissions
        </Btn>
        <p className="tiny muted">
          Finora never uploads messages, photos or call data. You can revoke any permission later in Android Settings.
        </p>
      </Card>

      <Card>
        <div className="spread">
          <div className="hstack">
            <span className="list-row__icon"><Bell size={17} /></span>
            <div>
              <p className="card-title">Notifications</p>
              <p className="card-sub">Reminders for salary, EMIs and bills</p>
            </div>
          </div>
          <span className={`pill ${notif === 'granted' ? 'pill--ok' : notif === 'denied' ? 'pill--danger' : 'pill--muted'}`}>
            {notif === 'unsupported' ? 'Unsupported' : notif === 'granted' ? 'Granted' : notif === 'denied' ? 'Denied' : 'Not asked'}
          </span>
        </div>
        <p className="tiny muted">
          In-app notifications work without permission. System notifications require your browser’s permission and are only requested from this button.
        </p>
        {notif === 'denied' ? (
          <div className="banner banner--warn">
            <span>If you previously blocked notifications, open your browser’s site settings or Android app settings, allow notifications, then return here. Finora re-checks when the app resumes.</span>
          </div>
        ) : null}
        <Btn variant="soft" size="sm" onClick={() => void requestNotifications()} disabled={notif === 'granted' || notif === 'unsupported'}>
          {notif === 'granted' ? 'Permission granted' : 'Allow notifications'}
        </Btn>
      </Card>

      <Card>
        <div className="spread">
          <div className="hstack">
            <span className="list-row__icon"><HardDrive size={17} /></span>
            <div>
              <p className="card-title">Persistent storage</p>
              <p className="card-sub">Reduce the risk of your browser evicting records</p>
            </div>
          </div>
          <span className={`pill ${persisted ? 'pill--ok' : 'pill--muted'}`}>
            {persisted == null ? 'Unknown' : persisted ? 'Granted' : 'Optional'}
          </span>
        </div>
        <p className="tiny muted">{estimate || 'Storage usage is reported by your browser.'}</p>
        <Btn variant="soft" size="sm" onClick={() => void requestPersistent()}>Request persistent storage</Btn>
      </Card>

      <Card>
        <div className="hstack">
          <span className="list-row__icon"><ImageIcon size={17} /></span>
          <div>
            <p className="card-title">Photos and files</p>
            <p className="card-sub">Account images, receipts, payslips and statements</p>
          </div>
        </div>
        <p className="tiny muted">
          Finora uses the system file and photo pickers, so it never needs broad storage permission. You choose individual files; nothing is scanned automatically.
        </p>
        <label className="btn btn--soft btn--sm" style={{ alignSelf: 'flex-start' }}>
          <Upload size={15} /> Try the file picker
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => {
            if (e.target.files?.[0]) toast('File picker works — choose files from Vault or a form to save them.');
            e.target.value = '';
          }} />
        </label>
      </Card>

      <Card>
        <div className="hstack">
          <span className="list-row__icon"><MessageSquare size={17} /></span>
          <div>
            <p className="card-title">Bank messages</p>
            <p className="card-sub">Read on this device, only after you allow it</p>
          </div>
        </div>
        <p className="tiny muted">
          With SMS access the APK reads recent bank messages, parses them locally into drafts and asks you to
          approve each one before a transaction exists. Nothing is uploaded and no Accessibility Service is used.
        </p>
        <div className="btn-row">
          <Btn variant="soft" size="sm" onClick={() => void allow('sms')}>Allow SMS</Btn>
          <Btn variant="soft" size="sm" onClick={() => navigate('/sms')}>Review messages</Btn>
        </div>
      </Card>

      <Card>
        <div className="hstack">
          <span className="list-row__icon"><Lock size={17} /></span>
          <div>
            <p className="card-title">Biometric lock</p>
            <p className="card-sub">Managed in Settings → App lock</p>
          </div>
        </div>
        <p className="tiny muted">The Android app uses the official biometric prompt with your device PIN, pattern or password as a fallback. Finora never receives or stores biometric data.</p>
        <Btn variant="soft" size="sm" onClick={() => navigate('/settings')}>Open app lock settings</Btn>
      </Card>
    </Screen>
  );
}

export function BackupScreen() {
  const state = useApp();
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [lastBackup, setLastBackup] = useState<{ at: string; size: number } | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const backup = async () => {
    setProgress({ phase: 'Preparing', percent: 2 });
    try {
      const blob = await createBackup(state, setProgress);
      downloadBlob(`finora-backup-${todayISO()}.zip`, blob);
      setLastBackup({ at: new Date().toISOString(), size: blob.size });
      toast('Backup created and downloaded');
    } catch (err) {
      toast(`Backup failed: ${(err as Error).message}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const pickBackup = async (file: File | undefined) => {
    if (!file) return;
    setRestoreError('');
    setProgress({ phase: 'Reading backup', percent: 5 });
    try {
      const result = await readBackup(file, setProgress);
      setPreview(result);
      setPreviewOpen(true);
    } catch (err) {
      setRestoreError((err as Error).message);
      toast(`Restore failed: ${(err as Error).message}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const records = Object.values(state.media).length + state.documents.length;

  return (
    <Screen title="Backup & restore" subtitle="Complete archive with real media files" back>
      <Card>
        <div className="spread">
          <div>
            <h2 className="card-title">Create a backup</h2>
            <p className="card-sub">ZIP · data, media, documents, manifest</p>
          </div>
          <Database size={20} className="muted" />
        </div>
        <div className="meta-grid">
          <div className="meta-box"><p className="meta-box__label">Accounts</p><p className="meta-box__value">{state.accounts.length}</p></div>
          <div className="meta-box"><p className="meta-box__label">Transactions</p><p className="meta-box__value">{state.transactions.length}</p></div>
          <div className="meta-box"><p className="meta-box__label">Media & documents</p><p className="meta-box__value">{records}</p></div>
          <div className="meta-box"><p className="meta-box__label">Schema</p><p className="meta-box__value">v{state.schemaVersion}</p></div>
        </div>
        {progress ? (
          <div className="stack--tight">
            <div className="progress-line"><span>{progress.phase}</span><strong>{progress.percent}%</strong></div>
            <Progress value={progress.percent} max={100} label="Backup progress" />
          </div>
        ) : null}
        <Btn onClick={() => void backup()} loading={Boolean(progress)} disabled={Boolean(progress)}>Create and download backup</Btn>
        {lastBackup ? (
          <p className="tiny muted">Last backup created {formatDate(lastBackup.at.slice(0, 10))} · {(lastBackup.size / 1024).toFixed(0)} KB</p>
        ) : null}
        <p className="hint">
          The archive contains financial records, profile and account images, receipts, payslips, agreements and a checksum manifest. Passwords and access tokens are never stored, so none can be exported.
        </p>
      </Card>

      <Card>
        <h2 className="card-title">Restore from backup</h2>
        <p className="card-sub">Every file is checksum-verified before import</p>
        <label className="btn btn--soft btn--block" style={{ display: 'inline-flex' }}>
          <Upload size={16} /> Choose ZIP backup
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => { void pickBackup(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
        {restoreError ? <div className="banner banner--danger"><span>{restoreError}</span></div> : null}
        <p className="hint">Restoring replaces the records on this device with the archive. You will see a summary and must confirm first.</p>
      </Card>

      <Card>
        <h2 className="card-title">Clear financial data</h2>
        <p className="card-sub">Keep your profile and preferences</p>
        <Btn variant="soft" onClick={() => setClearOpen(true)} icon={<Trash2 size={16} />}>Open clear-data workflow</Btn>
      </Card>

      <div className="banner banner--muted">
        <Lock size={16} />
        <span>Backups are unencrypted ZIP files. If you store them in cloud drives, use an encrypted folder or encrypted archive.</span>
      </div>

      <Sheet
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreview(null); }}
        title="Restore this backup?"
        subtitle={preview ? `Created ${formatDate(preview.createdAt.slice(0, 10))}` : undefined}
        footer={
          <>
            <Btn variant="soft" onClick={() => { setPreviewOpen(false); setPreview(null); }} disabled={restoring}>Cancel</Btn>
            <Btn
              variant="danger"
              loading={restoring}
              onClick={async () => {
                if (!preview) return;
                setRestoring(true);
                try {
                  applyRestore(preview);
                  await store.flush();
                  setPreviewOpen(false);
                  setPreview(null);
                  toast('Backup restored successfully');
                  navigate('/home', true);
                } catch (err) {
                  toast((err as Error).message, 'error');
                } finally {
                  setRestoring(false);
                }
              }}
            >
              Replace my data
            </Btn>
          </>
        }
      >
        <div className="confirm-body">
          <p>Archive verified: all files match their SHA-256 checksums.</p>
          <p><strong>Contents:</strong> {preview ? restoreSummary(preview) : ''}</p>
          <p>Restoring replaces the current records and media on this device. It will not merge with existing data.</p>
        </div>
        <div className="meta-grid">
          <div className="meta-box"><p className="meta-box__label">Backup currency</p><p className="meta-box__value">{preview?.state.settings.currency ?? '—'}</p></div>
          <div className="meta-box"><p className="meta-box__label">Schema</p><p className="meta-box__value">v{preview?.state.schemaVersion ?? '—'}</p></div>
          <div className="meta-box"><p className="meta-box__label">Documents</p><p className="meta-box__value">{preview?.counts.documents ?? 0}</p></div>
          <div className="meta-box"><p className="meta-box__label">Media</p><p className="meta-box__value">{preview?.counts.media ?? 0}</p></div>
        </div>
      </Sheet>

      <ClearDataSheet open={clearOpen} onClose={() => setClearOpen(false)} />
    </Screen>
  );
}

