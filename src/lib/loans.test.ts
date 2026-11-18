import { describe, expect, it } from 'vitest';
import { generateSchedule, loanFrequency, splitEmiPayment } from './calc';
import type { EmiPayment, Loan } from './types';

function loan(patch: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    name: 'Test loan',
    lender: 'Test Bank',
    currency: 'LKR',
    principal: 1_200_000,
    amountReceived: 1_200_000,
    annualRate: 12,
    method: 'flat',
    termMonths: 12,
    startDate: '2026-01-15',
    status: 'active',
    category: 'bank',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('flexible loan schedules', () => {
  it('defaults older loans to monthly repayment', () => {
    expect(loanFrequency(loan())).toBe('monthly');
    expect(generateSchedule(loan())).toHaveLength(12);
  });

  it('builds quarterly and annual instalments for the same term', () => {
    const quarterly = generateSchedule(loan({ frequency: 'quarterly' }));
    const annual = generateSchedule(loan({ termMonths: 24, frequency: 'annual' }));
    expect(quarterly).toHaveLength(4);
    expect(annual).toHaveLength(2);
    expect(quarterly.reduce((total, row) => total + row.principalDue, 0)).toBe(1_200_000);
    expect(annual.reduce((total, row) => total + row.principalDue, 0)).toBe(1_200_000);
  });

  it('settles an end-of-term loan once at maturity', () => {
    const rows = generateSchedule(loan({ frequency: 'end-of-term' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].principalDue).toBe(1_200_000);
    expect(rows[0].dueDate).toBe('2027-01-15');
    expect(rows[0].totalDue).toBeGreaterThan(rows[0].principalDue);
  });

  it('allocates a gold interest payment without reducing principal', () => {
    const rows = generateSchedule(
      loan({
        category: 'gold',
        principal: 100_000,
        termMonths: 6,
        method: 'flat',
        annualRate: 24,
        monthlyRate: 2,
        interestMode: 'interest-only',
      }),
    );
    const split = splitEmiPayment(rows[0], [], rows[0].interestDue, 'interest');
    expect('error' in split).toBe(false);
    if (!('error' in split)) {
      expect(split.interest).toBe(2_000);
      expect(split.principal).toBe(0);
    }
  });

  it('splits principal-only and interest-only payments explicitly', () => {
    const emi = generateSchedule(loan())[0];
    const principal = splitEmiPayment(emi, [], 50_000, 'principal');
    const interest = splitEmiPayment(emi, [], 5_000, 'interest');
    expect('error' in principal).toBe(false);
    expect('error' in interest).toBe(false);
    if (!('error' in principal) && !('error' in interest)) {
      expect(principal).toMatchObject({ principal: 50_000, interest: 0 });
      expect(interest).toMatchObject({ principal: 0, interest: 5_000 });
    }
  });

  it('rejects an interest-only payment larger than the interest due', () => {
    const emi = generateSchedule(loan())[0];
    const split = splitEmiPayment(emi, [], emi.interestDue + 1, 'interest');
    expect('error' in split).toBe(true);
  });

  it('treats existing payments as already settled principal', () => {
    const emi = generateSchedule(loan())[0];
    const payment: EmiPayment = {
      id: 'p1',
      loanId: 'loan-1',
      emiId: emi.id,
      date: '2026-02-01',
      amount: emi.principalDue,
      principal: emi.principalDue,
      interest: 0,
      fees: 0,
      accountId: 'a1',
      source: 'manual',
      createdAt: '2026-02-01T00:00:00.000Z',
    };
    const split = splitEmiPayment(emi, [payment], 1, 'principal');
    expect('error' in split).toBe(true);
  });
});
