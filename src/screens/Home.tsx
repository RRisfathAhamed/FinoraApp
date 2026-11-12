import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  LayoutGrid,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useApp, navigate, useResolvedTheme } from '../lib/hooks';
import {
  accountBalances,
  addDays,
  addMonthsClamped,
  budgetSpent,
  budgetStatus,
  categorySpend,
  financialSummary,
  formatDate,
  goalBalance,
  loanOutstanding,
  monthEnd,
  monthStart,
  monthlySeries,
  periodTotals,
  startOfWeek,
  todayISO,
  upcomingItems,
} from '../lib/calc';
import { formatMoney, percent } from '../lib/money';
import { buildNotifications } from '../lib/select';
import { DEFAULT_DASHBOARD } from '../lib/store';
import { actions } from '../lib/store';
import {
  Avatar,
  Card,
  Empty,
  IconBtn,
  Progress,
  SectionHead,
  Sheet,
  Btn,
  Field,
  Input,
} from '../components/ui';
import { AccountTile, Money, StatusPill, TxnRow } from '../components/bits';
import { IncomeExpenseBars } from '../components/charts';

type Period = 'month' | 'week' | 'last' | 'custom';

export default function HomeScreen() {
  const state = useApp();
  const theme = useResolvedTheme();
  const { settings, profile } = state;
  const hide = settings.hideBalances;
  const today = todayISO();
  const [period, setPeriod] = useState<Period>('month');
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(monthStart(today));
  const [customTo, setCustomTo] = useState(today);

  const range = useMemo(() => {
    if (period === 'week') {
      const from = startOfWeek(today);
      return { from, to: addDays(from, 6), label: 'This week' };
    }
    if (period === 'last') {
      const from = addMonthsClamped(monthStart(today), -1);
      return { from, to: monthEnd(from), label: 'Last month' };
    }
    if (period === 'custom') {
      return {
        from: customFrom <= customTo ? customFrom : customTo,
        to: customTo >= customFrom ? customTo : customFrom,
        label: `${formatDate(customFrom, settings.dateFormat)} – ${formatDate(customTo, settings.dateFormat)}`,
      };
    }
    return { from: monthStart(today), to: monthEnd(today), label: 'This month' };
  }, [period, customFrom, customTo, today, settings.dateFormat]);

  const summary = useMemo(() => financialSummary(state), [state]);
  const balances = useMemo(() => accountBalances(state), [state]);
  const currency = settings.currency;
  const assets = summary.assets.get(currency) ?? 0;
  const liabilities = summary.liabilities.get(currency) ?? 0;
  const netWorth = summary.netWorth.get(currency) ?? 0;
  const cash = summary.cash.get(currency) ?? 0;
  const otherCurrencies = useMemo(() => {
    const keys = new Set([...summary.assets.keys(), ...summary.liabilities.keys()]);
    return [...keys].filter((c) => c !== currency && ((summary.assets.get(c) ?? 0) !== 0 || (summary.liabilities.get(c) ?? 0) !== 0));
  }, [summary, currency]);

  const totals = useMemo(
    () => periodTotals(state, range.from, range.to, currency),
    [state, range.from, range.to, currency],
  );
  const spend = useMemo(
    () => categorySpend(state, range.from, range.to, currency).slice(0, 4),
    [state, range.from, range.to, currency],
  );
  const series = useMemo(() => monthlySeries(state, currency, 6), [state, currency]);

  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const upcoming = useMemo(() => upcomingItems(state).slice(0, 4), [state]);
  const nextSalary = useMemo(() => upcoming.find((item) => item.kind === 'salary'), [upcoming]);
  const nextEmi = useMemo(() => upcoming.find((item) => item.kind === 'emi'), [upcoming]);
  const loansOutstanding = useMemo(
    () =>
      state.loans
        .filter((loan) => loan.status !== 'closed' && loan.currency === currency)
        .reduce((total, loan) => total + loanOutstanding(loan, state.emiPayments), 0),
    [state.loans, state.emiPayments, currency],
  );
  const activeLoans = state.loans.filter((loan) => loan.status !== 'closed').length;
  const recent = useMemo(
    () => [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [state.transactions],
  );
  const budgets = state.budgets.filter((b) => !b.archived && !b.paused).slice(0, 2);
  const goals = [...state.goals.filter((g) => !g.archived)]
    .sort((a, b) => percent(goalBalance(b), b.target || 1) - percent(goalBalance(a), a.target || 1))
    .slice(0, 2);
  const unread = buildNotifications(state).filter((n) => !state.readNotifKeys.includes(n.key)).length;
  const avatar = profile.avatarId ? state.media[profile.avatarId]?.dataUrl : undefined;
  const firstName = profile.name.trim().split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const order = settings.dashboard.order.length ? settings.dashboard.order : DEFAULT_DASHBOARD;
  const hidden = settings.dashboard.hidden;
  const savedShare = totals.income > 0 ? Math.round(totals.savingsRate) : null;

  const sections: Record<string, JSX.Element> = {
    summary: (
      <section className="hero" key="summary">
        <div className="hero__glow" aria-hidden />
        <div className="hero__top">
          <div className="hero__identity">
            <span className="hero__label summary__label">Net worth</span>
            <span className="hero__currency">{currency}</span>
          </div>
          <div className="hero__tools">
            <button className="hero__tool" onClick={() => actions.settings.toggleBalancePrivacy()} aria-label={hide ? 'Show balances' : 'Hide balances'}>
              {hide ? <Eye size={14} /> : <EyeOff size={14} />}
              {hide ? 'Show' : 'Hide'}
            </button>
            <button className="hero__tool" onClick={() => navigate('/net-worth')}>
              Details <ChevronRight size={13} />
            </button>
          </div>
        </div>

        <div className="hero__amount-row">
          <p className="hero__amount summary__net">{formatMoney(netWorth, currency, { hide })}</p>
          {savedShare != null ? (
            <span className="hero__trend">
              <TrendingUp size={12} />
              {savedShare}% saved
            </span>
          ) : null}
        </div>
        <p className="hero__caption">
          {activeAccounts.length} active {activeAccounts.length === 1 ? 'account' : 'accounts'} · {range.label}
          {otherCurrencies.length ? ` · +${otherCurrencies.length} more currency` : ''}
        </p>

        <div className="hero__tiles">
          <div className="hero__tile">
            <p className="hero__tile-label">Assets</p>
            <p className="hero__tile-value">{formatMoney(assets, currency, { hide, compact: true })}</p>
          </div>
          <div className="hero__tile">
            <p className="hero__tile-label">Liabilities</p>
            <p className="hero__tile-value">{formatMoney(liabilities, currency, { hide, compact: true })}</p>
          </div>
          <div className="hero__tile">
            <p className="hero__tile-label">Available</p>
            <p className="hero__tile-value">{formatMoney(cash, currency, { hide, compact: true })}</p>
          </div>
        </div>

        <div className="hero__actions">
          <button className="hero__action" onClick={() => navigate('/money/new?kind=income')}>
            <span className="hero__action-icon"><ArrowDownLeft size={15} /></span>
            Income
          </button>
          <button className="hero__action" onClick={() => navigate('/money/new?kind=expense')}>
            <span className="hero__action-icon"><ArrowUpRight size={15} /></span>
            Expense
          </button>
          <button className="hero__action" onClick={() => navigate('/money/new?kind=transfer')}>
            <span className="hero__action-icon"><ArrowLeftRight size={15} /></span>
            Transfer
          </button>
        </div>
      </section>
    ),

    cashflow: (
      <Card key="cashflow">
        <div className="spread">
          <div>
            <h2 className="card-title">Cash flow</h2>
            <p className="card-sub">{range.label}</p>
          </div>
          <button className="link-btn" onClick={() => navigate('/insights')}>
            Insights <ChevronRight size={14} />
          </button>
        </div>

        <div className="chip-row">
          <button className={`chip ${period === 'week' ? 'chip--active' : ''}`} onClick={() => setPeriod('week')}>Week</button>
          <button className={`chip ${period === 'month' ? 'chip--active' : ''}`} onClick={() => setPeriod('month')}>Month</button>
          <button className={`chip ${period === 'last' ? 'chip--active' : ''}`} onClick={() => setPeriod('last')}>Last month</button>
          <button className={`chip ${period === 'custom' ? 'chip--active' : ''}`} onClick={() => setCustomOpen(true)}>Custom</button>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <p className="stat__label">Income</p>
            <p className="stat__value stat__value--in">{formatMoney(totals.income, currency, { hide, compact: true })}</p>
          </div>
          <div className="stat">
            <p className="stat__label">Expenses</p>
            <p className="stat__value stat__value--out">{formatMoney(totals.expense, currency, { hide, compact: true })}</p>
          </div>
          <div className="stat">
            <p className="stat__label">Saved</p>
            <p className="stat__value">{formatMoney(totals.savings, currency, { hide, compact: true })}</p>
          </div>
          <div className="stat">
            <p className="stat__label">Savings rate</p>
            <p className="stat__value">{totals.income > 0 ? `${Math.round(totals.savingsRate)}%` : '—'}</p>
          </div>
        </div>

        <IncomeExpenseBars data={series} currency={currency} hide={hide} />

        {spend.length ? (
          <div className="stack--tight">
            {spend.map((row) => (
              <div key={row.category}>
                <div className="progress-line">
                  <span>{row.category}</span>
                  <strong>{formatMoney(row.amount, currency, { compact: true, hide })}</strong>
                </div>
                <Progress value={row.amount} max={Math.max(totals.expense, 1)} label={`${row.category} share`} />
              </div>
            ))}
          </div>
        ) : (
          <p className="tiny muted">No expenses recorded in this period yet.</p>
        )}
      </Card>
    ),

    accounts: (
      <section key="accounts">
        <SectionHead
          title="Accounts"
          action={
            <button className="link-btn" onClick={() => navigate('/money')}>
              Manage <ChevronRight size={14} />
            </button>
          }
        />
        {activeAccounts.length ? (
          <div className="account-scroll">
            {activeAccounts.map((account, index) => (
              <AccountTile
                key={account.id}
                account={account}
                balance={balances.get(account.id) ?? 0}
                index={index}
                hide={hide}
                onClick={() => navigate(`/money/account/${account.id}`)}
              />
            ))}
            <button className="account-card account-card--add" onClick={() => navigate('/money/account/new')}>
              <Plus size={20} />
              Add account
            </button>
          </div>
        ) : (
          <Card>
            <Empty
              icon={<Landmark size={22} />}
              title="Add your first account"
              body="Link a bank account, cash wallet or card so balances and net worth become live."
              action={<Btn onClick={() => navigate('/money/account/new')}>Add account</Btn>}
            />
          </Card>
        )}
      </section>
    ),

    upcoming: (
      <section key="upcoming">
        <SectionHead
          title="Upcoming"
          action={
            <button className="link-btn" onClick={() => navigate('/calendar')}>
              Calendar <ChevronRight size={14} />
            </button>
          }
        />
        <Card className="card--flush">
          {upcoming.length ? (
            upcoming.map((item) => (
              <button key={item.key} className="list-row" onClick={() => navigate(item.link)}>
                <span className="list-row__icon">
                  {item.kind === 'salary' ? <Briefcase size={17} /> : item.kind === 'emi' ? <CreditCard size={17} /> : <Receipt size={17} />}
                </span>
                <span className="list-row__text">
                  <span className="list-row__title">{item.title}</span>
                  <span className="list-row__sub">
                    {formatDate(item.dueDate, settings.dateFormat)} · {item.subtitle}
                  </span>
                </span>
                <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <Money amount={item.amount} currency={item.currency} hide={hide} />
                  <StatusPill status={item.status} />
                </span>
              </button>
            ))
          ) : (
            <Empty title="Nothing due soon" body="Salary, EMIs and bills will appear here." icon={<Receipt size={20} />} />
          )}
        </Card>
      </section>
    ),

    progress: (
      <section key="progress">
        <SectionHead
          title="Savings & budgets"
          action={
            <button className="link-btn" onClick={() => navigate('/savings')}>
              Goals <ChevronRight size={14} />
            </button>
          }
        />
        <Card>
          {goals.length ? (
            goals.map((goal) => {
              const balance = goalBalance(goal);
              const pct = percent(balance, goal.target || 1);
              return (
                <div key={goal.id} className="stack--tight">
                  <div className="progress-line">
                    <span>{goal.name}</span>
                    <strong>{Math.round(pct)}%</strong>
                  </div>
                  <Progress value={balance} max={goal.target || 1} label={`${goal.name} progress`} />
                  <p className="tiny muted">
                    {formatMoney(Math.max(0, goal.target - balance), goal.currency, { hide })} to go
                  </p>
                </div>
              );
            })
          ) : (
            <button className="list-row" onClick={() => navigate('/savings')}>
              <span className="list-row__icon"><Target size={18} /></span>
              <span className="list-row__text">
                <span className="list-row__title">Create a savings goal</span>
                <span className="list-row__sub">Track progress towards what matters.</span>
              </span>
              <ChevronRight size={18} className="muted" />
            </button>
          )}

          {budgets.length ? <div className="divider" /> : null}
          {budgets.map((budget) => {
            const spent = budgetSpent(state, budget, today);
            const status = budgetStatus(spent, budget);
            return (
              <div key={budget.id} className="stack--tight">
                <div className="progress-line">
                  <span>{budget.name}</span>
                  <strong>{formatMoney(spent, budget.currency, { compact: true, hide })} / {formatMoney(budget.amount, budget.currency, { compact: true, hide })}</strong>
                </div>
                <Progress
                  value={spent}
                  max={budget.amount || 1}
                  tone={status === 'over' ? 'danger' : status === 'warning' ? 'warn' : 'brand'}
                  label={`${budget.name} usage`}
                />
              </div>
            );
          })}
          {!goals.length && !budgets.length ? (
            <button className="link-btn" onClick={() => navigate('/budgets')}>Set a monthly budget</button>
          ) : null}
        </Card>
      </section>
    ),

    recent: (
      <section key="recent">
        <SectionHead
          title="Recent activity"
          action={
            <button className="link-btn" onClick={() => navigate('/history')}>
              View all <ChevronRight size={14} />
            </button>
          }
        />
        <Card className="card--flush">
          {recent.length ? (
            recent.map((txn) => (
              <TxnRow key={txn.id} txn={txn} hide={hide} onClick={() => navigate(`/money/txn/${txn.id}`)} />
            ))
          ) : (
            <Empty
              icon={<ArrowUpRight size={20} />}
              title="No activity yet"
              body="Record income or an expense to see it here."
              action={<Btn size="sm" variant="soft" onClick={() => navigate('/money/new?kind=expense')}>Add expense</Btn>}
            />
          )}
        </Card>
      </section>
    ),
  };

  const rest = order.filter((key) => key !== 'summary' && sections[key] && !hidden.includes(key));

  return (
    <div className={`page home ${theme === 'dark' ? 'home--dark' : ''}`}>
      <header className="home-head">
        <div className="brand">
          <div className="brand__mark">F</div>
          <div>
            <p className="brand__name">Finora</p>
            <p className="brand__tag">Your money, clearly managed.</p>
          </div>
        </div>
        <div className="home-head__actions">
          <IconBtn label="Search" onClick={() => navigate('/search')}>
            <Search size={19} />
          </IconBtn>
          <IconBtn label="Notifications" onClick={() => navigate('/notifications')}>
            <Bell size={19} />
            {unread > 0 ? <span className="dot-badge" /> : null}
          </IconBtn>
          <button
            className="icon-btn"
            style={{ padding: 0, overflow: 'hidden' }}
            onClick={() => navigate('/profile')}
            aria-label="Open profile"
          >
            <Avatar name={profile.name} src={avatar} size={40} />
          </button>
        </div>
      </header>

      <div className="home-greet">
        <div className="home-greet__text">
          <p className="home-greet__eyebrow">
            <Sparkles size={12} /> {greeting}{firstName ? `, ${firstName}` : ''}
          </p>
          <p className="home-greet__date">{formatDate(today, settings.dateFormat)}</p>
        </div>
        <div className="home-greet__pills">
          <button className="flow-btn flow-btn--in" onClick={() => navigate('/money/new?kind=income')}>
            <ArrowDownLeft size={14} /> In
          </button>
          <button className="flow-btn flow-btn--out" onClick={() => navigate('/money/new?kind=expense')}>
            <ArrowUpRight size={14} /> Out
          </button>
        </div>
      </div>

      {!hidden.includes('summary') ? sections.summary : null}

      <section className="home-modules" aria-label="Quick sections">
        <div className="module-grid">
          <button className="module-tile" onClick={() => navigate('/money')}>
            <span className="module-tile__icon module-tile__icon--brand"><Wallet size={17} /></span>
            <span className="module-tile__label">Money</span>
            <span className="module-tile__meta">{activeAccounts.length} accounts</span>
          </button>
          <button className="module-tile" onClick={() => navigate('/salary')}>
            <span className="module-tile__icon module-tile__icon--blue"><Briefcase size={17} /></span>
            <span className="module-tile__label">Salary</span>
            <span className="module-tile__meta">
              {nextSalary ? formatDate(nextSalary.dueDate, settings.dateFormat) : 'No job yet'}
            </span>
          </button>
          <button className="module-tile" onClick={() => navigate('/loans')}>
            <span className="module-tile__icon module-tile__icon--amber"><Landmark size={17} /></span>
            <span className="module-tile__label">Loans</span>
            <span className="module-tile__meta">
              {activeLoans ? `${formatMoney(loansOutstanding, currency, { compact: true, hide })} left` : 'None active'}
            </span>
          </button>
          <button className="module-tile" onClick={() => navigate('/more')}>
            <span className="module-tile__icon module-tile__icon--violet"><LayoutGrid size={17} /></span>
            <span className="module-tile__label">More</span>
            <span className="module-tile__meta">Vault &amp; reports</span>
          </button>
        </div>
      </section>

      <div className="home-sections">
        {rest.map((key) => sections[key])}
        {nextEmi ? (
          <button className="home-nudge" onClick={() => navigate(nextEmi.link)}>
            <span className="home-nudge__icon"><CreditCard size={18} /></span>
            <span className="home-nudge__text">
              <strong>Next EMI</strong>
              <span>{nextEmi.title} · {formatDate(nextEmi.dueDate, settings.dateFormat)}</span>
            </span>
            <span className="home-nudge__amount">{formatMoney(nextEmi.amount, nextEmi.currency, { hide, compact: true })}</span>
            <ChevronRight size={16} className="muted" />
          </button>
        ) : null}
        {!hidden.includes('summary') && !rest.length ? (
          <button className="home-nudge" onClick={() => navigate('/calendar')}>
            <span className="home-nudge__icon"><CalendarDays size={18} /></span>
            <span className="home-nudge__text">
              <strong>See what is coming</strong>
              <span>Salary, EMIs and bills on one calendar</span>
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        ) : null}
      </div>

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)} title="Custom period" subtitle="Charts and totals follow these dates">
        <Field label="From">
          <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
        </Field>
        <div className="btn-row">
          <Btn variant="soft" onClick={() => setCustomOpen(false)}>Cancel</Btn>
          <Btn
            onClick={() => {
              setPeriod('custom');
              setCustomOpen(false);
            }}
          >
            Apply dates
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
