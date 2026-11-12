import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  CreditCard,
  Landmark,
  LayoutGrid,
  Plus,
  Receipt,
  Search,
  Wallet,
  Home as HomeIcon,
  ChevronRight,
} from 'lucide-react';
import { useApp, useResolvedTheme, useRoute, useScrollMemory, navigate, goBack, currentPath } from './lib/hooks';
import { closeTopOverlay } from './lib/backStack';
import { AppLock } from './components/AppLock';
import {
  LOCK_SETTINGS_EVENT,
  loadLockSettings,
  saveLockSettings,
  setAppLocked,
  type AppLockSettings,
} from './lib/appLock';
import { buildNotifications } from './lib/select';
import { actions, store } from './lib/store';
import { readDeviceMessages } from './lib/smsBridge';
import { syncDeviceReminders } from './lib/nativeNotify';
import { syncHomeWidget } from './lib/widget';
import { toast } from './lib/toast';
import { Btn, Sheet, Toaster } from './components/ui';
import HomeScreen from './screens/Home';
import {
  MoneyScreen,
  AccountForm,
  AccountDetail,
  TxnForm,
  TxnDetail,
  HistoryScreen,
} from './screens/Money';
import { SalaryScreen, JobForm, SalaryRecordForm } from './screens/Salary';
import { LoansScreen, LoanForm, LoanDetail } from './screens/Loans';
import MoreScreen from './screens/More';
import { BudgetsScreen, SavingsScreen, InvestmentsScreen } from './screens/Planning';
import { BillsScreen, CalendarScreen } from './screens/BillsCal';
import { VaultScreen, DocumentViewer } from './screens/Vault';
import InsightsScreen from './screens/Insights';
import NetWorthScreen from './screens/NetWorth';
import ReportsScreen from './screens/Reports';
import { SmsScreen, NotificationsScreen, SearchScreen, HelpScreen } from './screens/Misc';
import { SettingsScreen, ProfileScreen, PermissionsScreen, BackupScreen } from './screens/Settings';
import { Onboarding } from './screens/Onboarding';

const TABS = [
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'money', label: 'Money', icon: Wallet },
  { key: 'salary', label: 'Salary', icon: Briefcase },
  { key: 'loans', label: 'Loans', icon: Landmark },
  { key: 'more', label: 'More', icon: LayoutGrid },
];

const QUICK_ACTIONS = [
  { label: 'Add income', hint: 'Money received', icon: <ArrowDownLeft size={18} />, to: '/money/new?kind=income' },
  { label: 'Add expense', hint: 'Money spent', icon: <ArrowUpRight size={18} />, to: '/money/new?kind=expense' },
  { label: 'Transfer money', hint: 'Between your accounts', icon: <ArrowLeftRight size={18} />, to: '/money/new?kind=transfer' },
  { label: 'Record salary', hint: 'Payroll for a job', icon: <Briefcase size={18} />, to: '/salary' },
  { label: 'Pay EMI', hint: 'Loan instalment', icon: <CreditCard size={18} />, to: '/loans' },
  { label: 'Add account', hint: 'Bank, cash or wallet', icon: <Landmark size={18} />, to: '/money/account/new' },
  { label: 'Add loan', hint: 'Track a new borrowing', icon: <Landmark size={18} />, to: '/loans/new' },
  { label: 'Add bill', hint: 'Recurring obligation', icon: <Receipt size={18} />, to: '/bills' },
];

function Splash({ done }: { done: boolean }) {
  return (
    <div className={`splash ${done ? 'splash--hide' : ''}`} aria-hidden>
      <div className="splash__glow" />
      <div className="splash__inner">
        <div className="splash__mark">
          <span>F</span>
          <i className="splash__sheen" />
        </div>
        <div className="splash__bars" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="splash__name">Finora</div>
        <div className="splash__tag">Your money, clearly managed.</div>
      </div>
      <div className="splash__foot">SECURE · LOCAL-FIRST</div>
    </div>
  );
}

export default function App() {
  const state = useApp();
  const theme = useResolvedTheme();
  const { segments } = useRoute();
  const [splashDone, setSplashDone] = useState(() => {
    try {
      return sessionStorage.getItem('finora-splash') === '1';
    } catch {
      return false;
    }
  });
  const [quickOpen, setQuickOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [lockSettings, setLockSettings] = useState<AppLockSettings>(loadLockSettings);
  const [locked, setLocked] = useState(() => loadLockSettings().enabled);
  const lockedRef = useRef(locked);
  const lastInteraction = useRef(Date.now());
  const backgroundedAt = useRef<number | null>(null);
  lockedRef.current = locked;

  const tab = segments[0] ?? 'home';
  const activeTab = TABS.some((t) => t.key === tab) ? tab : 'more';
  const isRoot = segments.length === 1;
  const [s0, s1] = segments;
  const notificationCount = buildNotifications(state).filter(
    (n) => !state.readNotifKeys.includes(n.key),
  ).length;

  useScrollMemory(activeTab);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0f0d' : '#f4f6f5');
    // Keep the Android status/notch band in step with the app background so the
    // layout starts below the system bars instead of under them.
    const host = (window as Window & {
      FinoraNativeHost?: { setChromeColor?: (hex: string) => void; setLightStatusBars?: (light: boolean) => void };
    }).FinoraNativeHost;
    try {
      host?.setChromeColor?.(theme === 'dark' ? '#0a0f0d' : '#f4f6f5');
      host?.setLightStatusBars?.(theme === 'light');
    } catch {
      /* older native hosts do not expose the chrome bridge */
    }
  }, [theme]);


  // Branded cold-start introduction. Warm resumes do not reload the document,
  // and a reload inside the same session skips the animation completely.
  useEffect(() => {
    if (splashDone) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      setSplashDone(true);
      try {
        sessionStorage.setItem('finora-splash', '1');
      } catch {
        /* storage may be unavailable in private mode */
      }
    }, reduceMotion ? 700 : 2600);
    return () => window.clearTimeout(timer);
  }, [splashDone]);

  // Keep the Android notification queue and home-screen widget in step with
  // the records. Debounced so typing in a form does not thrash native calls.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      syncDeviceReminders(state);
      syncHomeWidget(state);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    setAppLocked(lockSettings.enabled && locked);
  }, [lockSettings.enabled, locked]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<AppLockSettings>).detail ?? loadLockSettings();
      setLockSettings(next);
      if (!next.enabled) setLocked(false);
    };
    window.addEventListener(LOCK_SETTINGS_EVENT, sync);
    return () => window.removeEventListener(LOCK_SETTINGS_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!lockSettings.enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        backgroundedAt.current = Date.now();
        if (lockSettings.lockOnBackground || lockSettings.timeout === 0) setLocked(true);
        return;
      }
      const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : Number.POSITIVE_INFINITY;
      backgroundedAt.current = null;
      if (lockSettings.lockOnBackground || lockSettings.timeout === 0 || away >= lockSettings.timeout) {
        setLocked(true);
      }
      lastInteraction.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lockSettings]);

  useEffect(() => {
    if (!lockSettings.enabled || locked || lockSettings.timeout === 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current >= lockSettings.timeout) {
        setLocked(true);
      }
    }, 1000);
    const bump = () => { lastInteraction.current = Date.now(); };
    document.addEventListener('pointerdown', bump, true);
    document.addEventListener('keydown', bump, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', bump, true);
      document.removeEventListener('keydown', bump, true);
    };
  }, [lockSettings, locked]);

  useEffect(() => {
    if (!locked) return;
    setQuickOpen(false);
    setExitOpen(false);
  }, [locked]);

  const unlock = () => {
    lastInteraction.current = Date.now();
    setLocked(false);
  };

  const disableLock = () => {
    const next = { ...lockSettings, enabled: false };
    saveLockSettings(next);
    setLockSettings(next);
    setLocked(false);
  };

  // Native Android Back is routed here by MainActivity. Overlays close first,
  // then nested screens unwind, then roots return to Home, then we ask to exit.
  useEffect(() => {
    const handler = () => {
      if (lockedRef.current) return true;
      if (closeTopOverlay()) return true;
      const segmentsNow = currentPath().split('?')[0].split('/').filter(Boolean);
      if (segmentsNow.length > 1) {
        goBack('/home');
        return true;
      }
      if (segmentsNow[0] && segmentsNow[0] !== 'home') {
        navigate('/home');
        return true;
      }
      setExitOpen(true);
      return true;
    };
    const win = window as Window & {
      FinoraAndroidBack?: () => boolean;
      FinoraNativeHost?: { exitApp: () => void };
    };
    win.FinoraAndroidBack = handler;
    return () => {
      if (win.FinoraAndroidBack === handler) delete win.FinoraAndroidBack;
    };
  }, []);

  // Edge-swipe back, the gesture people expect from Flowly-style apps. It
  // dismisses the top sheet first, then unwinds one screen.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || lockedRef.current) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = startX <= 30;
    };
    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dx < 72 || dy > 64) return;
      if (closeTopOverlay()) return;
      goBack('/home');
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  const exitApp = () => {
    setExitOpen(false);
    const host = (window as Window & { FinoraNativeHost?: { exitApp: () => void } }).FinoraNativeHost;
    if (host?.exitApp) host.exitApp();
    else window.close();
  };

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void store.flush();
    };
    const pageHide = () => void store.flush();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', pageHide);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', pageHide);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [segments[0], segments[1]]);

  // Native Android builds can expose the SMS inbox through the bridge. Read it
  // once on launch, create reviewable drafts, and never post a transaction
  // without the user confirming it in Bank messages.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const messages = await readDeviceMessages(30);
      if (cancelled || !messages.length) return;
      let added = 0;
      for (const message of messages.slice(0, 200)) {
        const result = actions.sms.ingest(message.body, store.getSnapshot().settings.currency);
        if (!result.duplicate) added += 1;
      }
      if (!cancelled && added > 0) {
        toast(`${added} bank message${added === 1 ? '' : 's'} detected — review before saving`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  let content: JSX.Element;
  switch (s0) {
    case 'home':
      content = <HomeScreen />;
      break;
    case 'money': {
      if (s1 === 'new') content = <TxnForm />;
      else if (s1 === 'account' && s2Is(segments, 2, 'new')) content = <AccountForm />;
      else if (s1 === 'account' && segments[3] === 'edit') content = <AccountForm accountId={segments[2]} />;
      else if (s1 === 'account' && segments[2]) content = <AccountDetail accountId={segments[2]} />;
      else if (s1 === 'txn' && segments[2]) content = <TxnDetail txnId={segments[2]} />;
      else content = <MoneyScreen />;
      break;
    }
    case 'salary':
      if (s1 === 'new') content = <JobForm jobId={segments[2]} />;
      else if (s1 === 'record' && segments[2] && segments[3]) {
        content = <SalaryRecordForm jobId={segments[2]} periodKey={decodeURIComponent(segments[3])} />;
      } else content = <SalaryScreen />;
      break;
    case 'loans':
      if (s1 === 'new') content = <LoanForm />;
      else if (s1 && segments[2] === 'edit') content = <LoanForm loanId={s1} />;
      else if (s1) content = <LoanDetail loanId={s1} />;
      else content = <LoansScreen />;
      break;
    case 'more':
      content = <MoreScreen />;
      break;
    case 'budgets':
      content = <BudgetsScreen />;
      break;
    case 'savings':
      content = <SavingsScreen />;
      break;
    case 'investments':
      content = <InvestmentsScreen />;
      break;
    case 'bills':
      content = <BillsScreen />;
      break;
    case 'calendar':
      content = <CalendarScreen />;
      break;
    case 'vault':
      content = s1 ? <DocumentViewer docId={s1} /> : <VaultScreen />;
      break;
    case 'insights':
      content = <InsightsScreen />;
      break;
    case 'reports':
      content = <ReportsScreen />;
      break;
    case 'net-worth':
      content = <NetWorthScreen />;
      break;
    case 'history':
      content = <HistoryScreen />;
      break;
    case 'sms':
      content = <SmsScreen />;
      break;
    case 'notifications':
      content = <NotificationsScreen />;
      break;
    case 'search':
      content = <SearchScreen />;
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
    case 'profile':
      content = <ProfileScreen />;
      break;
    case 'permissions':
      content = <PermissionsScreen />;
      break;
    case 'backup':
      content = <BackupScreen />;
      break;
    case 'help':
      content = <HelpScreen />;
      break;
    default:
      content = <HomeScreen />;
  }

  const showFab = (activeTab === 'home' || activeTab === 'money') && isRoot;

  return (
    <div className="app">
      <main className="app-main">{content}</main>

      {showFab ? (
        <button className="fab" aria-label="Quick actions" onClick={() => setQuickOpen(true)}>
          <Plus size={26} />
        </button>
      ) : null}

      <nav className="tabbar" aria-label="Primary">
        <div className="tabbar__inner">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                className={`tab ${active ? 'tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
                  else navigate(`/${item.key}`);
                }}
              >
                <span className="tab__indicator" />
                <span className="tab__icon"><Icon size={21} strokeWidth={active ? 2.3 : 1.9} /></span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Quick actions"
        subtitle="Start a financial workflow"
      >
        <div className="list">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="list-row"
              onClick={() => {
                setQuickOpen(false);
                navigate(action.to);
              }}
            >
              <span className="list-row__icon">{action.icon}</span>
              <span className="list-row__text">
                <span className="list-row__title">{action.label}</span>
                <span className="list-row__sub">{action.hint}</span>
              </span>
              <span className="list-row__trail"><ChevronRight size={18} className="muted" /></span>
            </button>
          ))}
        </div>
        <button className="list-row" onClick={() => { setQuickOpen(false); navigate('/search'); }}>
          <span className="list-row__icon"><Search size={18} /></span>
          <span className="list-row__text">
            <span className="list-row__title">Search everything</span>
            <span className="list-row__sub">Accounts, transactions, documents</span>
          </span>
          <span className="list-row__trail"><ChevronRight size={18} className="muted" /></span>
        </button>
        {notificationCount > 0 ? (
          <button className="list-row" onClick={() => { setQuickOpen(false); navigate('/notifications'); }}>
            <span className="list-row__icon"><Bell size={18} /></span>
            <span className="list-row__text">
              <span className="list-row__title">Notifications</span>
              <span className="list-row__sub">{notificationCount} unread</span>
            </span>
            <span className="list-row__trail"><ChevronRight size={18} className="muted" /></span>
          </button>
        ) : null}
      </Sheet>

      <Sheet
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Exit Finora?"
        subtitle="Your records are already saved on this device"
        footer={
          <>
            <Btn variant="soft" onClick={() => setExitOpen(false)}>Stay in app</Btn>
            <Btn variant="danger" onClick={exitApp}>Exit app</Btn>
          </>
        }
      >
        <div className="confirm-body">
          <p>Do you want to exit Finora?</p>
        </div>
      </Sheet>

      <Toaster />
      {lockSettings.enabled && locked && splashDone ? (
        <AppLock onUnlock={unlock} onDisable={disableLock} />
      ) : null}
      {splashDone && !state.profile.onboarded ? <Onboarding /> : null}
      <Splash done={splashDone} />
    </div>
  );
}

function s2Is(segments: string[], index: number, value: string) {
  return segments[index] === value;
}
