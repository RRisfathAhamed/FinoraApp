import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Pencil,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { Account } from '../lib/types';
import { navigate } from '../lib/hooks';
import { AccountTile } from './bits';
import { Sheet } from './ui';

export function AccountCarousel({
  accounts,
  balances,
  hide,
  onAdd,
}: {
  accounts: Account[];
  balances: Map<string, number>;
  hide: boolean;
  onAdd: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressOrigin = useRef({ x: 0, y: 0 });
  const longPressFired = useRef(false);
  const suppressClick = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [quickAccount, setQuickAccount] = useState<Account | null>(null);

  const cards = () =>
    Array.from(railRef.current?.querySelectorAll<HTMLElement>('.account-card:not(.account-card--add)') ?? []);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const updateActive = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const items = cards();
    if (!items.length) return;
    let closest = 0;
    let best = Number.POSITIVE_INFINITY;
    items.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - rail.scrollLeft);
      if (distance < best) {
        best = distance;
        closest = index;
      }
    });
    setActive(closest);
  }, []);

  const onScroll = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateActive();
    });
  };

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, accounts.length - 1)));
  }, [accounts.length]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    clearLongPress();
  }, []);

  const scrollToCard = (index: number) => {
    const rail = railRef.current;
    const card = cards()[index];
    if (!rail || !card) return;
    const left = rail.scrollLeft + card.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
    setActive(index);
  };

  const finishDrag = () => {
    const rail = railRef.current;
    const drag = dragRef.current;
    if (!rail || !drag) return;
    if (drag.moved) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 80);
      const items = cards();
      let closest = 0;
      let best = Number.POSITIVE_INFINITY;
      items.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - rail.scrollLeft);
        if (distance < best) {
          best = distance;
          closest = index;
        }
      });
      scrollToCard(closest);
    }
    if (drag.captured && rail.hasPointerCapture(drag.pointerId)) rail.releasePointerCapture(drag.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <>
      <div
        className={`account-rail${dragging ? ' account-rail--dragging' : ''}`}
        aria-roledescription="carousel"
        aria-label="Accounts"
      >
        <div
          className="account-scroll"
          ref={railRef}
          onScroll={onScroll}
          onClickCapture={(event) => {
            if (longPressFired.current) {
              event.preventDefault();
              event.stopPropagation();
              longPressFired.current = false;
              return;
            }
            if (!suppressClick.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            longPressFired.current = false;
            const target = event.target as HTMLElement;
            if (target.closest('.account-card__menu') || target.closest('.account-card--add')) return;

            clearLongPress();
            const card = target.closest<HTMLElement>('.account-card');
            const index = card ? cards().indexOf(card) : -1;
            if (index >= 0) {
              longPressOrigin.current = { x: event.clientX, y: event.clientY };
              longPressTimer.current = window.setTimeout(() => {
                longPressTimer.current = null;
                longPressFired.current = true;
                finishDrag();
                setQuickAccount(accounts[index]);
              }, 480);
            }

            if (event.pointerType !== 'mouse') return;
            const rail = event.currentTarget;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startScroll: rail.scrollLeft,
              moved: false,
              captured: false,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (longPressTimer.current !== null && (
              Math.abs(event.clientX - longPressOrigin.current.x) > 5 ||
              Math.abs(event.clientY - longPressOrigin.current.y) > 5
            )) {
              clearLongPress();
            }
            const rail = railRef.current;
            const drag = dragRef.current;
            if (!rail || !drag || drag.pointerId !== event.pointerId) return;
            const delta = event.clientX - drag.startX;
            if (!drag.moved && Math.abs(delta) > 5) {
              drag.moved = true;
              drag.captured = true;
              rail.setPointerCapture(event.pointerId);
            }
            if (drag.moved) rail.scrollLeft = drag.startScroll - delta;
          }}
          onPointerUp={() => { clearLongPress(); finishDrag(); }}
          onPointerCancel={() => { clearLongPress(); finishDrag(); }}
          onPointerLeave={clearLongPress}
        >
          {accounts.map((account, index) => (
            <AccountTile
              key={account.id}
              account={account}
              balance={balances.get(account.id) ?? 0}
              index={index}
              hide={hide}
              active={active === index}
              onClick={() => navigate(`/money/account/${account.id}`)}
              onMenu={() => setQuickAccount(account)}
            />
          ))}
          <button type="button" className="account-card account-card--add" onClick={onAdd}>
            <span className="account-card__add-icon"><Plus size={21} /></span>
            <span>Add account</span>
          </button>
        </div>
      </div>

      {accounts.length > 1 ? (
        <div className="account-dots" aria-label="Account selection">
          {accounts.map((account, index) => (
            <button
              key={account.id}
              type="button"
              className={`account-dot ${active === index ? 'account-dot--active' : ''}`}
              aria-label={`Show ${account.name}`}
              aria-current={active === index}
              onClick={() => scrollToCard(index)}
            />
          ))}
        </div>
      ) : null}

      <Sheet
        open={Boolean(quickAccount)}
        onClose={() => setQuickAccount(null)}
        title={quickAccount?.name ?? 'Account'}
        subtitle="Quick account actions"
      >
        <div className="list">
          <button className="list-row" onClick={() => { if (!quickAccount) return; navigate(`/money/account/${quickAccount.id}`); setQuickAccount(null); }}>
            <span className="list-row__icon"><SettingsIcon size={18} /></span>
            <span className="list-row__text"><span className="list-row__title">Account details</span><span className="list-row__sub">Balance, activity and reconciliation</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
          <button className="list-row" onClick={() => { if (!quickAccount) return; navigate(`/money/account/${quickAccount.id}/edit`); setQuickAccount(null); }}>
            <span className="list-row__icon"><Pencil size={18} /></span>
            <span className="list-row__text"><span className="list-row__title">Edit account</span><span className="list-row__sub">Category, identity and card design</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
          <button className="list-row" onClick={() => { if (!quickAccount) return; navigate(`/money/new?kind=expense&account=${quickAccount.id}`); setQuickAccount(null); }}>
            <span className="list-row__icon list-row__icon--danger"><ArrowUpRight size={18} /></span>
            <span className="list-row__text"><span className="list-row__title">Add expense</span><span className="list-row__sub">Use this account</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
          <button className="list-row" onClick={() => { if (!quickAccount) return; navigate(`/money/new?kind=income&account=${quickAccount.id}`); setQuickAccount(null); }}>
            <span className="list-row__icon"><ArrowDownLeft size={18} /></span>
            <span className="list-row__text"><span className="list-row__title">Add income</span><span className="list-row__sub">Use this account</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
          <button className="list-row" onClick={() => { if (!quickAccount) return; navigate(`/money/new?kind=transfer&account=${quickAccount.id}`); setQuickAccount(null); }}>
            <span className="list-row__icon"><ArrowLeftRight size={18} /></span>
            <span className="list-row__text"><span className="list-row__title">Transfer money</span><span className="list-row__sub">Move funds between accounts</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
        </div>
      </Sheet>
    </>
  );
}
