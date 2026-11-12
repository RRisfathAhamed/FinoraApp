import { useState, type ReactNode } from 'react';
import {
  Car,
  GraduationCap,
  House,
  PiggyBank,
  Plane,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { Budget, BudgetPeriod, Investment, SavingsGoal } from '../lib/types';
import { useApp } from '../lib/hooks';
import {
  budgetRange,
  budgetSpent,
  budgetStatus,
  formatDate,
  formatMonth,
  goalBalance,
  goalProjection,
  monthStart,
  todayISO,
} from '../lib/calc';
import { formatMoney, percent } from '../lib/money';
import { actions } from '../lib/store';
import { EXPENSE_CATEGORIES } from '../lib/categories';
import { formatDate as fmt, addMonthsClamped } from '../lib/calc';
import { compressImage, type FilePayload } from '../lib/files';
import { toast } from '../lib/toast';
import {
  Btn,
  Card,
  Confirm,
  CurrencySelect,
  Empty,
  Field,
  Input,
  MoneyField,
  Progress,
  Screen,
  Select,
  Sheet,
  Textarea,
  Toggle,
  IconBtn,
} from '../components/ui';

const GOAL_ICONS: Record<string, (props: { size?: number }) => ReactNode> = {
  target: (p) => <Target size={p.size ?? 18} />,
  piggy: (p) => <PiggyBank size={p.size ?? 18} />,
  home: (p) => <House size={p.size ?? 18} />,
  car: (p) => <Car size={p.size ?? 18} />,
  education: (p) => <GraduationCap size={p.size ?? 18} />,
  travel: (p) => <Plane size={p.size ?? 18} />,
  emergency: (p) => <ShieldCheck size={p.size ?? 18} />,
};

const GOAL_ICON_KEYS = Object.keys(GOAL_ICONS);

function GoalGlyph({ icon }: { icon?: string }) {
  const render = GOAL_ICONS[icon ?? 'target'] ?? GOAL_ICONS.target;
  return <span className="category-dot">{render({ size: 18 })}</span>;
}

/* ------------------------------------------------------------------- budgets */

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  custom: 'Custom range',
};

export function BudgetsScreen() {
  const state = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Budget | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const hide = state.settings.hideBalances;
  const currency = state.settings.currency;
  const active = state.budgets.filter((b) => !b.archived);
  const archived = state.budgets.filter((b) => b.archived);
  const total = active.filter((b) => b.currency === currency).reduce((t, b) => t + b.amount, 0);
  const spent = active
    .filter((b) => b.currency === currency)
    .reduce((t, b) => t + budgetSpent(state, b), 0);

  return (
    <Screen
      title="Budgets"
      subtitle="Limits, alerts and category spending"
      back
      actions={
        <IconBtn label="Add budget" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={20} />
        </IconBtn>
      }
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">This period</p>
            <p className="summary__net">{formatMoney(Math.max(0, total - spent), currency, { hide })}</p>
          </div>
          <Target size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Budgeted</p>
            <p className="summary__cell-value">{formatMoney(total, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Spent</p>
            <p className="summary__cell-value">{formatMoney(spent, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Used</p>
            <p className="summary__cell-value">{total > 0 ? `${Math.round(percent(spent, total))}%` : '—'}</p>
          </div>
        </div>
        <div className="summary__foot"><span>Remaining budget</span><span>{currency}</span></div>
      </div>

      {active.length ? (
        <div className="stack">
          {active.map((budget) => {
            const used = budgetSpent(state, budget);
            const status = budgetStatus(used, budget);
            const range = budgetRange(budget);
            return (
              <Card key={budget.id} onClick={() => { setEditing(budget); setFormOpen(true); }} className="card--pressable">
                <div className="spread">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="card-title">{budget.name}</h3>
                    <p className="card-sub">
                      {PERIOD_LABEL[budget.period]} · {budget.categories.length ? budget.categories.join(', ') : 'All categories'}
                    </p>
                  </div>
                  <span className={`pill ${status === 'over' ? 'pill--danger' : status === 'warning' ? 'pill--warn' : 'pill--ok'}`}>
                    {status === 'over' ? 'Over budget' : status === 'warning' ? 'Near limit' : 'On track'}
                  </span>
                </div>
                <div className="progress-line">
                  <span>{formatMoney(used, budget.currency, { hide })} of {formatMoney(budget.amount, budget.currency, { hide })}</span>
                  <strong>{Math.round(percent(used, budget.amount || 1))}%</strong>
                </div>
                <Progress
                  value={used}
                  max={budget.amount || 1}
                  tone={status === 'over' ? 'danger' : status === 'warning' ? 'warn' : 'brand'}
                  label={`${budget.name} budget usage`}
                />
                <p className="tiny muted">
                  {formatDate(range.from, state.settings.dateFormat)} – {formatDate(range.to, state.settings.dateFormat)}
                  {budget.paused ? ' · paused' : ''}
                  {budget.rollover ? ' · rolls over' : ''}
                </p>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<Target size={22} />}
            title="No budgets yet"
            body="Create a monthly, weekly or custom budget and Finora tracks real expenses against it."
            action={<Btn onClick={() => { setEditing(null); setFormOpen(true); }}>Create a budget</Btn>}
          />
        </Card>
      )}

      {archived.length ? (
        <div>
          <button className="link-btn" onClick={() => setShowArchived((v) => !v)}>Archived budgets ({archived.length})</button>
          {showArchived ? archived.map((budget) => (
            <Card key={budget.id} className="card--soft">
              <div className="spread">
                <div>
                  <p className="card-title">{budget.name}</p>
                  <p className="card-sub">{PERIOD_LABEL[budget.period]} · {budget.currency}</p>
                </div>
                <Btn size="sm" variant="soft" onClick={() => { setEditing(budget); setFormOpen(true); }}>Restore</Btn>
              </div>
            </Card>
          )) : null}
        </div>
      ) : null}

      {formOpen ? (
        <BudgetSheet
          key={editing?.id ?? 'new'}
          editing={editing}
          currency={currency}
          onClose={() => setFormOpen(false)}
          onArchive={(budget) => {
            setFormOpen(false);
            setArchiveTarget(budget);
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title={archiveTarget?.archived ? 'Restore budget?' : 'Archive budget?'}
        message={archiveTarget?.archived ? 'This budget will count again.' : 'The budget is hidden from summaries. History is kept.'}
        danger={false}
        confirmLabel={archiveTarget?.archived ? 'Restore' : 'Archive'}
        onConfirm={() => {
          if (!archiveTarget) return;
          actions.budget.setArchived(archiveTarget.id, !archiveTarget.archived);
          setArchiveTarget(null);
          toast(archiveTarget.archived ? 'Budget restored' : 'Budget archived');
        }}
      />
    </Screen>
  );
}

function BudgetSheet({
  editing,
  currency,
  onClose,
  onArchive,
}: {
  editing: Budget | null;
  currency: string;
  onClose: () => void;
  onArchive: (budget: Budget) => void;
}) {
  const state = useApp();
  const [name, setName] = useState(editing?.name ?? '');
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [cur, setCur] = useState(editing?.currency ?? currency);
  const [period, setPeriod] = useState<BudgetPeriod>(editing?.period ?? 'monthly');
  const [categories, setCategories] = useState<string[]>(editing?.categories ?? []);
  const [startDate, setStartDate] = useState(editing?.startDate ?? monthStart(todayISO()));
  const [endDate, setEndDate] = useState(editing?.endDate ?? addMonthsClamped(todayISO(), 1));
  const [alertAt, setAlertAt] = useState(editing?.alertAt ?? 80);
  const [rollover, setRollover] = useState(editing?.rollover ?? false);
  const [paused, setPaused] = useState(editing?.paused ?? false);
  const [error, setError] = useState('');

  const toggleCategory = (category: string) =>
    setCategories((prev) => prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]);

  const save = () => {
    setError('');
    if (!name.trim()) { setError('Budget name is required.'); return; }
    if (amount <= 0) { setError('Enter a budget amount.'); return; }
    if (period === 'custom' && endDate < startDate) { setError('End date must be after the start date.'); return; }
    try {
      const payload = {
        name: name.trim(),
        amount,
        currency: cur,
        period,
        categories,
        startDate,
        endDate: period === 'custom' ? endDate : undefined,
        alertAt,
        rollover,
        paused,
      };
      if (editing) actions.budget.update(editing.id, payload);
      else actions.budget.add(payload);
      toast(editing ? 'Budget updated' : 'Budget created');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit budget' : 'New budget'}
      subtitle="Track real spending against a limit"
      footer={
        <>
          <Btn variant="soft" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save budget</Btn>
        </>
      }
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <Field label="Budget name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" autoFocus />
      </Field>
      <MoneyField label="Budget amount" value={amount} currency={cur} onChange={setAmount} />
      <div className="row">
        <Field label="Period">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom range</option>
          </Select>
        </Field>
        <CurrencySelect value={cur} onChange={setCur} label="Currency" />
      </div>
      {period === 'custom' ? (
        <div className="row">
          <Field label="Starts"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Ends"><Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
      ) : null}

      <div className="field">
        <span className="label">Categories</span>
        <div className="hstack wrap">
          {EXPENSE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`chip ${categories.includes(category) ? 'chip--active' : ''}`}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <p className="hint">Leave empty to budget across every expense category.</p>
      </div>

      <Field label={`Alert threshold — ${alertAt}%`}>
        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={alertAt}
          onChange={(e) => setAlertAt(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </Field>
      <Toggle checked={rollover} onChange={setRollover} label="Roll over unused amount" description="Carry unspent budget into the next period." />
      <Toggle checked={paused} onChange={setPaused} label="Pause budget" description="Keep the budget but stop alerts and progress warnings." />

      {editing ? (
        <>
          <Btn variant="soft" onClick={() => onArchive(editing)}>
            {editing.archived ? 'Restore budget' : 'Archive budget'}
          </Btn>
          <Btn
            variant="ghost"
            icon={<Trash2 size={16} />}
            onClick={() => {
              actions.budget.setArchived(editing.id, true);
              toast('Budget archived');
              onClose();
            }}
          >
            Remove from list
          </Btn>
        </>
      ) : null}
      <p className="tiny muted">{state.settings.currency} spending is matched by transaction category and date range.</p>
    </Sheet>
  );
}

/* ------------------------------------------------------------------- savings */

export function SavingsScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const currency = state.settings.currency;
  const [goalOpen, setGoalOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [contributeTo, setContributeTo] = useState<SavingsGoal | null>(null);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);
  const goals = state.goals.filter((g) => !g.archived);
  const saved = goals.filter((g) => g.currency === currency).reduce((t, g) => t + goalBalance(g), 0);
  const target = goals.filter((g) => g.currency === currency).reduce((t, g) => t + g.target, 0);

  return (
    <Screen
      title="Savings"
      subtitle="Goals and contributions"
      back
      actions={<IconBtn label="Add savings goal" onClick={() => { setEditing(null); setGoalOpen(true); }}><Plus size={20} /></IconBtn>}
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Total saved</p>
            <p className="summary__net">{formatMoney(saved, currency, { hide })}</p>
          </div>
          <PiggyBank size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Goals</p>
            <p className="summary__cell-value">{goals.length}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Combined target</p>
            <p className="summary__cell-value">{formatMoney(target, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Progress</p>
            <p className="summary__cell-value">{target > 0 ? `${Math.round(percent(saved, target))}%` : '—'}</p>
          </div>
        </div>
        <div className="summary__foot"><span>Allocated savings count as assets, never as expenses.</span></div>
      </div>

      {goals.length ? (
        <div className="stack">
          {goals.map((goal) => {
            const balance = goalBalance(goal);
            const projection = goalProjection(goal);
            return (
              <Card key={goal.id}>
                <div className="spread">
                  <div className="hstack" style={{ minWidth: 0 }}>
                    <GoalGlyph icon={goal.icon} />
                    <div style={{ minWidth: 0 }}>
                      <h3 className="card-title">{goal.name}</h3>
                      <p className="card-sub">
                        {goal.targetDate ? `Target ${formatDate(goal.targetDate, state.settings.dateFormat)}` : 'No target date'}
                      </p>
                    </div>
                  </div>
                  <Btn size="sm" variant="soft" onClick={() => { setEditing(goal); setGoalOpen(true); }}>Edit</Btn>
                </div>
                <div className="progress-line">
                  <span>{formatMoney(balance, goal.currency, { hide })} of {formatMoney(goal.target, goal.currency, { hide })}</span>
                  <strong>{Math.round(percent(balance, goal.target || 1))}%</strong>
                </div>
                <Progress value={balance} max={goal.target || 1} tone={balance >= goal.target ? 'ok' : 'brand'} label={`${goal.name} progress`} />
                <div className="meta-grid">
                  <div className="meta-box">
                    <p className="meta-box__label">Remaining</p>
                    <p className="meta-box__value">{formatMoney(Math.max(0, goal.target - balance), goal.currency, { hide })}</p>
                  </div>
                  <div className="meta-box">
                    <p className="meta-box__label">Suggested monthly</p>
                    <p className="meta-box__value">{formatMoney(projection.suggested, goal.currency, { hide })}</p>
                  </div>
                </div>
                {projection.eta ? <p className="tiny muted">At your current pace you could reach this goal around {formatDate(projection.eta)}.</p> : null}
                <div className="btn-row">
                  <Btn variant="soft" onClick={() => { setContributeTo(goal); setDirection('in'); }}>Add money</Btn>
                  <Btn variant="soft" onClick={() => { setContributeTo(goal); setDirection('out'); }} disabled={balance <= 0}>Withdraw</Btn>
                </div>
                {goal.contributions.length ? (
                  <div className="card--flush" style={{ border: 0 }}>
                    {[...goal.contributions].slice(-3).reverse().map((c) => (
                      <div key={c.id} className="list-row" style={{ minHeight: 46, paddingLeft: 0, paddingRight: 0 }}>
                        <span className="list-row__icon"><Wallet size={15} /></span>
                        <span className="list-row__text">
                          <span className="list-row__title">{c.direction === 'in' ? 'Contribution' : 'Withdrawal'} · {formatMoney(c.amount, goal.currency, { hide })}</span>
                          <span className="list-row__sub">{formatDate(c.date, state.settings.dateFormat)}</span>
                        </span>
                        <button
                          className="icon-btn icon-btn--plain"
                          aria-label="Remove contribution"
                          onClick={() => {
                            actions.goal.removeContribution(goal.id, c.id);
                            toast('Contribution removed');
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button className="link-btn" onClick={() => setDeleteTarget(goal)}>Remove goal</button>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<PiggyBank size={22} />}
            title="No savings goals"
            body="Set a target and track contributions. Allocations move money out of an account without counting as an expense."
            action={<Btn onClick={() => { setEditing(null); setGoalOpen(true); }}>Create a goal</Btn>}
          />
        </Card>
      )}

      {goalOpen ? (
        <GoalSheet key={editing?.id ?? 'new'} editing={editing} currency={currency} onClose={() => setGoalOpen(false)} />
      ) : null}

      <ContributionSheet
        goal={contributeTo}
        direction={direction}
        onClose={() => setContributeTo(null)}
      />

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove savings goal?"
        message="The goal and its contribution history are removed. Money already moved out of accounts is not returned automatically."
        confirmLabel="Remove goal"
        onConfirm={() => {
          if (!deleteTarget) return;
          actions.goal.update(deleteTarget.id, { archived: true });
          setDeleteTarget(null);
          toast('Goal removed');
        }}
      />
    </Screen>
  );
}

function GoalSheet({
  editing,
  currency,
  onClose,
}: {
  editing: SavingsGoal | null;
  currency: string;
  onClose: () => void;
}) {
  const state = useApp();
  const [name, setName] = useState(editing?.name ?? '');
  const [target, setTarget] = useState(editing?.target ?? 0);
  const [cur, setCur] = useState(editing?.currency ?? currency);
  const [targetDate, setTargetDate] = useState(editing?.targetDate ?? addMonthsClamped(todayISO(), 6));
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'target');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState('');
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === cur);

  const save = () => {
    setError('');
    if (!name.trim()) { setError('Goal name is required.'); return; }
    try {
      if (editing) actions.goal.update(editing.id, { name: name.trim(), target, currency: cur, targetDate, accountId: accountId || undefined, icon, notes: notes.trim() || undefined });
      else actions.goal.add({ name: name.trim(), target, currency: cur, targetDate, accountId: accountId || undefined, icon, notes: notes.trim() || undefined });
      toast(editing ? 'Goal updated' : 'Goal created');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit goal' : 'New savings goal'}
      footer={<><Btn variant="soft" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save goal</Btn></>}
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <Field label="Goal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" autoFocus />
      </Field>
      <MoneyField label="Target amount" value={target} currency={cur} onChange={setTarget} />
      <div className="row">
        <CurrencySelect value={cur} onChange={setCur} />
        <Field label="Target date">
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Default account" hint="Used when adding money to this goal">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">No linked account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <div className="field">
        <span className="label">Goal icon</span>
        <div className="hstack wrap">
          {GOAL_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`Icon ${key}`}
              className="icon-btn"
              onClick={() => setIcon(key)}
              style={icon === key ? { borderColor: 'var(--brand)', color: 'var(--brand-ink)', background: 'var(--brand-soft)' } : undefined}
            >
              {GOAL_ICONS[key]({ size: 18 })}
            </button>
          ))}
        </div>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <p className="tiny muted">Adding money to a goal moves it out of the chosen account. It is never counted as income or an expense.</p>
    </Sheet>
  );
}

function ContributionSheet({
  goal,
  direction,
  onClose,
}: {
  goal: SavingsGoal | null;
  direction: 'in' | 'out';
  onClose: () => void;
}) {
  const state = useApp();
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [key, setKey] = useState(0);

  if (!goal) return null;
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === goal.currency);
  const balance = goalBalance(goal);

  return (
    <Sheet
      key={`${goal.id}-${direction}-${key}`}
      open
      onClose={onClose}
      title={direction === 'in' ? 'Add to goal' : 'Withdraw from goal'}
      subtitle={`${goal.name} · ${formatMoney(balance, goal.currency)} saved`}
      footer={
        <>
          <Btn variant="soft" onClick={onClose}>Cancel</Btn>
          <Btn
            variant={direction === 'in' ? 'primary' : 'danger'}
            onClick={() => {
              setError('');
              try {
                actions.goal.contribute(goal.id, { amount, accountId: accountId || undefined, date, direction });
                toast(direction === 'in' ? 'Contribution recorded' : 'Withdrawal recorded');
                setAmount(0);
                setKey((k) => k + 1);
                onClose();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {direction === 'in' ? 'Add money' : 'Withdraw'}
          </Btn>
        </>
      }
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <MoneyField label="Amount" value={amount} currency={goal.currency} onChange={setAmount} autoFocus />
      <Field label="Account" hint={direction === 'in' ? 'Money leaves this account and becomes saved' : 'Money returns to this account'}>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">No account movement</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {!accountId ? <p className="tiny muted">Without an account this only updates the goal balance and leaves cash unchanged.</p> : null}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- investments */

const INVESTMENT_TYPES = ['Stocks', 'Mutual fund', 'Fixed deposit', 'Gold', 'Property', 'Crypto', 'Other'];

export function InvestmentsScreen() {
  const state = useApp();
  const hide = state.settings.hideBalances;
  const currency = state.settings.currency;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const items = state.investments.filter((i) => !i.archived);
  const value = items.filter((i) => i.currency === currency).reduce((t, i) => t + i.currentValue, 0);
  const cost = items.filter((i) => i.currency === currency).reduce((t, i) => t + i.costBasis, 0);
  const gain = value - cost;

  return (
    <Screen
      title="Investments"
      subtitle="Manual and estimated asset values"
      back
      actions={<IconBtn label="Add investment" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={20} /></IconBtn>}
    >
      <div className="summary">
        <div className="summary__top">
          <div>
            <p className="summary__label">Portfolio value</p>
            <p className="summary__net">{formatMoney(value, currency, { hide })}</p>
          </div>
          <TrendingUp size={22} style={{ opacity: 0.85 }} />
        </div>
        <div className="summary__grid">
          <div className="summary__cell">
            <p className="summary__cell-label">Cost basis</p>
            <p className="summary__cell-value">{formatMoney(cost, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">{gain >= 0 ? 'Unrealised gain' : 'Unrealised loss'}</p>
            <p className="summary__cell-value">{formatMoney(gain, currency, { hide })}</p>
          </div>
          <div className="summary__cell">
            <p className="summary__cell-label">Assets</p>
            <p className="summary__cell-value">{items.length}</p>
          </div>
        </div>
        <div className="summary__foot"><span>No market data connected</span><span>{currency}</span></div>
      </div>

      <div className="banner banner--muted">
        <span>Values are entered or estimated by you. Finora does not fabricate live market prices.</span>
      </div>

      {items.length ? (
        <Card className="card--flush">
          {items.map((item) => {
            const diff = item.currentValue - item.costBasis;
            return (
              <button key={item.id} className="list-row" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <span className="list-row__icon">{diff >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}</span>
                <span className="list-row__text">
                  <span className="list-row__title">{item.name}</span>
                  <span className="list-row__sub">
                    {item.type} · {item.quantity} units · {formatDate(item.purchaseDate, state.settings.dateFormat)}
                  </span>
                </span>
                <span className="list-row__trail" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span className="num">{formatMoney(item.currentValue, item.currency, { hide })}</span>
                  <span className={`tiny num ${diff >= 0 ? 'stat__value--in' : 'stat__value--out'}`}>
                    {formatMoney(diff, item.currency, { signed: true, hide })}
                  </span>
                </span>
              </button>
            );
          })}
        </Card>
      ) : (
        <Card>
          <Empty
            icon={<TrendingUp size={22} />}
            title="No investments tracked"
            body="Add assets with a cost basis and an estimated current value."
            action={<Btn onClick={() => { setEditing(null); setFormOpen(true); }}>Add investment</Btn>}
          />
        </Card>
      )}

      {formOpen ? (
        <InvestmentSheet key={editing?.id ?? 'new'} editing={editing} currency={currency} onClose={() => setFormOpen(false)} />
      ) : null}
    </Screen>
  );
}

function InvestmentSheet({
  editing,
  currency,
  onClose,
}: {
  editing: Investment | null;
  currency: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? 'Stocks');
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [cur, setCur] = useState(editing?.currency ?? currency);
  const [purchaseDate, setPurchaseDate] = useState(editing?.purchaseDate ?? todayISO());
  const [cost, setCost] = useState(editing?.costBasis ?? 0);
  const [value, setValue] = useState(editing?.currentValue ?? 0);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [attachment, setAttachment] = useState<FilePayload | null>(null);
  const [error, setError] = useState('');
  const state = useApp();
  const existingAttachment = editing?.attachmentId ? state.media[editing.attachmentId]?.dataUrl : undefined;

  const save = () => {
    setError('');
    if (!name.trim()) { setError('Investment name is required.'); return; }
    try {
      let attachmentId = editing?.attachmentId;
      if (attachment) {
        attachmentId = actions.media.add({ name: attachment.name, mime: attachment.mime, size: attachment.size, dataUrl: attachment.dataUrl });
      }
      const payload = {
        name: name.trim(), type, quantity, currency: cur, purchaseDate,
        costBasis: cost, currentValue: value, notes: notes.trim() || undefined, attachmentId,
      };
      if (editing) actions.investment.update(editing.id, payload);
      else actions.investment.add(payload);
      toast(editing ? 'Investment updated' : 'Investment added');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit investment' : 'Add investment'}
      footer={<><Btn variant="soft" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save investment</Btn></>}
    >
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Index fund" autoFocus /></Field>
      <div className="row">
        <Field label="Asset type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {INVESTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Quantity">
          <Input type="number" inputMode="decimal" min={0} value={quantity} onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
      </div>
      <MoneyField label="Cost basis" value={cost} currency={cur} onChange={setCost} />
      <MoneyField label="Current estimated value" value={value} currency={cur} onChange={setValue} />
      <div className="row">
        <CurrencySelect value={cur} onChange={setCur} />
        <Field label="Purchase date"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>

      <div className="field">
        <span className="label">Attachment</span>
        {attachment?.dataUrl || existingAttachment ? (
          <div className="upload-box">
            <span className="upload-box__preview"><img src={attachment?.dataUrl ?? existingAttachment} alt="Attachment preview" /></span>
            <span className="upload-box__text">
              <span className="upload-box__title">{attachment?.name ?? 'Saved attachment'}</span>
              <span className="upload-box__sub">Stored on this device</span>
            </span>
          </div>
        ) : null}
        <label className="btn btn--soft btn--sm" style={{ alignSelf: 'flex-start' }}>
          {attachment ? 'Replace attachment' : 'Attach document image'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                setAttachment(await compressImage(file, 1200));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
      </div>

      {editing ? (
        <Btn
          variant="ghost"
          icon={<Trash2 size={16} />}
          onClick={() => {
            actions.investment.setArchived(editing.id, true);
            toast('Investment archived');
            onClose();
          }}
        >
          Archive investment
        </Btn>
      ) : null}
    </Sheet>
  );
}

void fmt;
void formatMonth;
