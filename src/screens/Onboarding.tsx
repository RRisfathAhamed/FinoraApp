import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Camera,
  Check,
  ChevronLeft,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
} from 'lucide-react';
import { useApp } from '../lib/hooks';
import { actions } from '../lib/store';
import { CURRENCIES } from '../lib/money';
import type { FilePayload } from '../lib/files';
import { ImageCropper } from '../components/ImageCropper';
import { Avatar } from '../components/ui';
import { requestAllNativePermissions } from '../lib/nativePerms';
import { toast } from '../lib/toast';

/**
 * First-run introduction. Three short, skippable steps: who you are, how you
 * want to be reached, and the money defaults Finora should use. Nothing is
 * required — Skip is always available and can be revisited from Profile.
 */
export function Onboarding() {
  const state = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.profile.name);
  const [email, setEmail] = useState(state.profile.email);
  const [phone, setPhone] = useState(state.profile.phone ?? '');
  const [occupation, setOccupation] = useState(state.profile.occupation ?? '');
  const [location, setLocation] = useState(state.profile.location ?? '');
  const [currency, setCurrency] = useState(state.settings.currency);
  const [photo, setPhoto] = useState<FilePayload | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const steps = useMemo(
    () => [
      { key: 'welcome', title: 'Welcome', hint: 'A calmer way to run your money.' },
      { key: 'identity', title: 'About you', hint: 'Name and a photo — both optional.' },
      { key: 'details', title: 'Details', hint: 'How you reach your money.' },
      { key: 'ready', title: 'Ready', hint: 'Everything stays on this device.' },
    ],
    [],
  );
  const last = step === steps.length - 1;

  const commit = () => {
    setBusy(true);
    try {
      let avatarId = state.profile.avatarId;
      if (photo) {
        if (avatarId) actions.media.remove(avatarId);
        avatarId = actions.media.add({
          name: photo.name,
          mime: photo.mime,
          size: photo.size,
          dataUrl: photo.dataUrl,
        });
      }
      actions.profile.update({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        occupation: occupation.trim() || undefined,
        location: location.trim() || undefined,
        avatarId,
        onboarded: true,
      });
      if (currency !== state.settings.currency) actions.settings.update({ currency });
      void requestAllNativePermissions();
      toast('Welcome to Finora');
    } finally {
      setBusy(false);
    }
  };

  const skipAll = () => {
    actions.profile.update({ onboarded: true });
    void requestAllNativePermissions();
  };

  const next = () => {
    if (last) {
      commit();
      return;
    }
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const back = () => {
    if (step === 0) skipAll();
    else setStep((current) => Math.max(0, current - 1));
  };

  return (
    <div className="onb">
      <div className="onb__glow" aria-hidden />
      <div className="onb__orb onb__orb--a" aria-hidden />
      <div className="onb__orb onb__orb--b" aria-hidden />

      <header className="onb__top">
        <button className="onb__back" onClick={back} aria-label={step === 0 ? 'Skip introduction' : 'Go back'}>
          {step === 0 ? <span>Skip</span> : <ChevronLeft size={20} />}
        </button>
        <div className="onb__dots" aria-hidden>
          {steps.map((item, index) => (
            <span key={item.key} className={`onb__dot ${index <= step ? 'onb__dot--on' : ''} ${index === step ? 'onb__dot--now' : ''}`} />
          ))}
        </div>
        <span className="onb__step-count">0{step + 1} / 0{steps.length}</span>
      </header>

      <div className="onb__viewport">
        <div className="onb__track" style={{ transform: `translateX(-${step * 100}%)` }}>
          {/* ---------------------------------------------------------- welcome */}
          <section className="onb__slide" aria-hidden={step !== 0}>
            <div className="onb__mark">
              <span>F</span>
              <i />
            </div>
            <p className="onb__eyebrow"><Sparkles size={13} /> MEET FINORA</p>
            <h1>Your money,<br />clearly managed.</h1>
            <p className="onb__lede">
              Accounts, salary, loans and bills in one calm place. Private by design —
              every number lives on this device, never on a server.
            </p>
            <div className="onb__features">
              <span><Wallet size={15} /> Live balances</span>
              <span><Briefcase size={15} /> Salary cycles</span>
              <span><ShieldCheck size={15} /> No cloud</span>
            </div>
          </section>

          {/* --------------------------------------------------------- identity */}
          <section className="onb__slide" aria-hidden={step !== 1}>
            <div className="onb__avatar-wrap">
              <Avatar name={name || 'You'} src={photo?.dataUrl} size={110} />
              <label className="onb__avatar-btn">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setPendingFile(file);
                    event.target.value = '';
                  }}
                />
                <Camera size={16} />
              </label>
            </div>
            <p className="onb__eyebrow"><User size={13} /> ABOUT YOU</p>
            <h1>What should we<br />call you?</h1>
            <p className="onb__lede">A name and photo make the app yours. You can change both later.</p>
            <div className="onb__fields">
              <label className="onb__field">
                <span>Full name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  autoFocus
                />
              </label>
              <label className="onb__field">
                <span>Email</span>
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
            </div>
          </section>

          {/* ---------------------------------------------------------- details */}
          <section className="onb__slide" aria-hidden={step !== 2}>
            <p className="onb__eyebrow"><MapPin size={13} /> PERSONAL DETAILS</p>
            <h1>A little more<br />context.</h1>
            <p className="onb__lede">Optional details that shape reminders and reports.</p>
            <div className="onb__fields">
              <label className="onb__field">
                <span>Phone</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+94 7X XXX XXXX"
                  autoComplete="tel"
                />
              </label>
              <label className="onb__field">
                <span>Occupation</span>
                <input
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                  placeholder="Designer, engineer, student…"
                />
              </label>
              <label className="onb__field">
                <span>City or country</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Where you live"
                />
              </label>
              <label className="onb__field">
                <span>Primary currency</span>
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {CURRENCIES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} — {item.symbol}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* ------------------------------------------------------------ ready */}
          <section className="onb__slide" aria-hidden={step !== 3}>
            <div className="onb__ready">
              <Avatar name={name || 'You'} src={photo?.dataUrl} size={92} />
              <span className="onb__ready-badge"><Check size={14} /></span>
            </div>
            <p className="onb__eyebrow"><ShieldCheck size={13} /> ALL SET</p>
            <h1>{name.trim() ? `Nice to meet you, ${name.trim().split(' ')[0]}.` : 'You are all set.'}</h1>
            <p className="onb__lede">
              We will ask for notifications, messages and call access once so reminders and
              bank-message detection can work. You can decline any of them and change it later.
            </p>
            <div className="onb__summary">
              <span><strong>{currency}</strong> primary currency</span>
              <span><strong>{photo ? 'Added' : 'Skipped'}</strong> profile photo</span>
              <span><strong>{phone || email ? 'Saved' : 'Skipped'}</strong> contact details</span>
            </div>
          </section>
        </div>
      </div>

      <footer className="onb__foot">
        <button className="btn btn--ghost" onClick={skipAll} disabled={busy}>
          {last ? 'Skip for now' : 'Skip'}
        </button>
        <button className="btn btn--primary onb__next" onClick={next} disabled={busy}>
          {last ? 'Enter Finora' : 'Continue'}
          {last ? <Check size={17} /> : <ArrowRight size={17} />}
        </button>
      </footer>

      <p className="onb__sign">Designed &amp; developed by Risfath Ahamed</p>

      {pendingFile ? (
        <ImageCropper
          file={pendingFile}
          round
          title="Profile photo"
          onCancel={() => setPendingFile(null)}
          onDone={(payload) => {
            setPhoto(payload);
            setPendingFile(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default Onboarding;
