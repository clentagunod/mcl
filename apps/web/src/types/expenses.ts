export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  revision: number;
}

/** Paid cash expenses only. Empty clientId/loanId means a shared business cost. */
export interface ExpenseInput {
  categoryId: string;
  categoryName: string;
  amount: number;
  expenseDate: string;
  description: string;
  reference: string;
  clientId: string;
  loanId: string;
}

export interface Expense extends ExpenseInput {
  id: string;
  status: 'posted' | 'void';
  voidReason: string;
  revision: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
}
