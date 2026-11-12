export const INCOME_CATEGORIES = [
  'Salary',
  'Business',
  'Freelance',
  'Interest',
  'Refund',
  'Gift',
  'Other income',
];

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Shopping',
  'Health',
  'Education',
  'Entertainment',
  'Insurance',
  'Subscriptions',
  'Fees',
  'Other',
];

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].filter(
  (value, index, list) => list.indexOf(value) === index,
);
