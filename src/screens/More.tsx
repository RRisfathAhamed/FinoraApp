import {
  BarChart3,
  Bell,
  CalendarDays,
  Database,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  History,
  Landmark,
  MessageSquare,
  PiggyBank,
  Receipt,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  TrendingUp,
  User,
} from 'lucide-react';
import { Btn, Screen } from '../components/ui';
import { useApp, navigate } from '../lib/hooks';
import { requestHomeWidget } from '../lib/widget';
import { toast } from '../lib/toast';
import type { ReactNode } from 'react';
import { visibleNotifications } from '../lib/select';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="section-title" style={{ margin: '4px 2px 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
        {title}
      </h2>
      <div className="card card--flush">{children}</div>
    </section>
  );
}

function Row({
  icon,
  title,
  subtitle,
  to,
  badge,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  to: string;
  badge?: ReactNode;
}) {
  return (
    <button className="list-row" onClick={() => navigate(to)}>
      <span className="list-row__icon">{icon}</span>
      <span className="list-row__text">
        <span className="list-row__title">{title}</span>
        <span className="list-row__sub">{subtitle}</span>
      </span>
      <span className="list-row__trail">{badge}</span>
    </button>
  );
}

export default function MoreScreen() {
  const state = useApp();
  const pendingSms = state.smsDrafts.filter((d) => d.status === 'pending').length;
  const unread = visibleNotifications(state).filter((n) => !state.readNotifKeys.includes(n.key)).length;

  return (
    <Screen title="More" subtitle={`${state.accounts.length} accounts · ${state.settings.currency} primary currency`}>
      <Group title="Financial management">
        <Row icon={<FileText size={18} />} title="Vault" subtitle="Documents, agreements and receipts" to="/vault" />
        <Row icon={<Target size={18} />} title="Budgets" subtitle="Spending limits and alerts" to="/budgets" />
        <Row icon={<PiggyBank size={18} />} title="Savings" subtitle="Goals and contributions" to="/savings" />
        <Row icon={<TrendingUp size={18} />} title="Investments" subtitle="Assets and estimated value" to="/investments" />
        <Row icon={<Receipt size={18} />} title="Bills" subtitle="Recurring and one-off obligations" to="/bills" />
        <Row icon={<CalendarDays size={18} />} title="Calendar" subtitle="Salary, EMI, bill and reminder dates" to="/calendar" />
        <Row icon={<Bell size={18} />} title="Reminders" subtitle="Custom bill, card and subscription alerts" to="/reminders" />
      </Group>

      <Group title="Analysis">
        <Row icon={<BarChart3 size={18} />} title="Insights" subtitle="Charts, trends and category analysis" to="/insights" />
        <Row icon={<FileSpreadsheet size={18} />} title="Reports" subtitle="Statements, registers and printable exports" to="/reports" />
        <Row icon={<Landmark size={18} />} title="Net worth" subtitle="Asset and liability breakdown" to="/net-worth" />
      </Group>

      <Group title="Activity">
        <Row
          icon={<MessageSquare size={18} />}
          title="Bank message detection"
          subtitle="Detect, review and approve bank messages"
          to="/sms"
          badge={pendingSms ? <span className="pill pill--warn">{pendingSms} to review</span> : undefined}
        />
        <Row
          icon={<Bell size={18} />}
          title="Notifications"
          subtitle="Reminders and alerts"
          to="/notifications"
          badge={unread ? <span className="pill pill--danger">{unread} unread</span> : undefined}
        />
        <Row icon={<History size={18} />} title="Transaction history" subtitle="Search and export activity" to="/history" />
      </Group>

      <Group title="Account">
        <Row icon={<User size={18} />} title="Profile" subtitle="Name, contact details and photo" to="/profile" />
        <Row icon={<SettingsIcon size={18} />} title="Settings" subtitle="Theme, currency, privacy and dashboard" to="/settings" />
        <Row icon={<ShieldCheck size={18} />} title="Permissions" subtitle="Notifications, files and camera access" to="/permissions" />
        <Row icon={<Database size={18} />} title="Backup and restore" subtitle="Complete ZIP archive with media" to="/backup" />
        <Row icon={<HelpCircle size={18} />} title="Help and support" subtitle="How Finora calculates your money" to="/help" />
      </Group>

      <section className="widget-card">
        <div className="widget-card__preview" aria-hidden>
          <span className="widget-card__label">NET WORTH</span>
          <span className="widget-card__value">At a glance</span>
          <span className="widget-card__sub">{state.settings.currency} · cash · accounts</span>
        </div>
        <div>
          <h2 className="card-title">Home screen widget</h2>
          <p className="card-sub">Pin your balance to the Android home screen</p>
        </div>
        <Btn
          variant="soft"
          size="sm"
          onClick={() => {
            if (!requestHomeWidget()) {
              toast('Home screen widgets are available in the Android app.', 'info');
              return;
            }
            toast('Confirm the pin prompt to add Finora');
          }}
        >
          Add widget to home screen
        </Btn>
      </section>

      <div className="developer-card" style={{ marginTop: 6 }}>
        <div className="developer-card__head">
          <div className="developer-card__mark">RA</div>
          <div>
            <p className="card-title">Risfath Ahamed</p>
            <p className="card-sub">Designer &amp; developer of Finora</p>
          </div>
        </div>
        <div className="developer-card__meta">
          <span>Finora 1.0.3</span>
          <span>Local-first</span>
          <span>Android · Web</span>
        </div>
      </div>

      <p className="tiny muted center" style={{ marginTop: 4 }}>
        Built with care by Risfath Ahamed · everything stays on this device
      </p>
    </Screen>
  );
}
