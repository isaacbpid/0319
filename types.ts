
export enum TransactionType {
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
  STARTUP = 'STARTUP',
  WITHDRAWAL = 'WITHDRAWAL',
  OWNER_INVESTMENT = 'ADD_RMB',
  OWNER_WITHDRAWAL = 'CASH_OUT',
  TRANSFER = 'TRANSFER'
}

export enum Category {
  // Revenue Categories
  WASH = '洗車 (Wash)',
  DETAIL = '美容 (Detailing)',
  COATING = '鍍晶 (Coating)',
  INTERIOR = '內飾清潔 (Interior)',
  WINDOW = '玻璃撥水 (Window)',
  
  // Expense Categories
  RENT = '租金 (Rent)',
  UTILITY = '水電 (Utilities)',
  SALARY = '薪金 (Salary)',
  SUPPLIES = '耗材 (Supplies)',
  MARKETING = '營銷 (Marketing)',
  RENOVATION = '裝修 (Renovation)',
  EQUIPMENT = '設備 (Equipment)',
  
  // Other
  OTHER = '其他 (Other)',
  OWNER_INVESTMENT = 'Add RMB',
  OWNER_WITHDRAWAL = 'Cash Out'
}

export enum Owner {
  OWNER_A = 'User 1',
  OWNER_B = 'User 2'
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT'
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  tableName: string;
  recordId?: string;
  changedBy?: string;
  oldData?: any;
  newData?: any;
  createdAt: string;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  date: string;
  type: TransactionType;
  categoryId: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  description: string;
  contributedBy: string;
  imageUrl?: string;
  updatedAt?: string;
  isInitialInvestment?: boolean;
  notes?: string;
  customerId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  id: string;
  partnerId: string;
  sessionToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface Note {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  type: TransactionType;
  createdAt: string;
}

// New database schema types
export enum NewTransactionType {
  EXPENSE = 'expense',
  INCOME = 'income',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment'
}

export enum AccountType {
  COMPANY_BANK = 'company_bank',
  PARTNER_PERSONAL = 'partner_personal',
  CASH = 'cash',
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  OTHER = 'other'
}

export enum FundingSourceType {
  COMPANY_ACCOUNT = 'company_account',
  PARTNER_PERSONAL = 'partner_personal',
  CASH = 'cash'
}

export enum PartnerEntryType {
  CAPITAL_CONTRIBUTION = 'capital_contribution',
  EXPENSE_PAID_FOR_COMPANY = 'expense_paid_for_company',
  CAPITAL_WITHDRAWAL = 'capital_withdrawal',
  PROFIT_DISTRIBUTION = 'profit_distribution',
  OTHER_ADJUSTMENT = 'other_adjustment'
}

export interface Partner {
  id: string;
  nameEn: string;
  nameZh?: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  createdAt: string;
}

export interface PartnerLedgerEntry {
  id: string;
  partnerId: string;
  relatedTxId?: string;
  entryType: PartnerEntryType;
  amount: number;
  description?: string;
  occurredAt: string;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  nameEn: string;
  nameZh?: string;
  code?: string;
  isExpense: boolean;
  isIncome: boolean;
  sortOrder?: number;
  createdAt: string;
}

export interface NewTransaction {
  id: string;
  trackingNumber?: string;
  type: NewTransactionType;
  occurredAt: string;
  accountId: string;
  fundingSourceType: FundingSourceType;
  partnerId?: string;
  categoryId?: string;
  amount: number;
  currencyCode: string;
  description?: string;
  isRecurringInstance: boolean;
  recurringRuleId?: string;
  isForCustomerOrder: boolean;
  customerOrderId?: string;
  isInitialInvestment: boolean;
  createdAt: string;
}

export interface TransactionSplit {
  id: string;
  transactionId: string;
  partnerId?: string;
  shareAmount: number;
  isInitialInvestment: boolean;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  startupCosts: number;
  currentBalance: number;
  bankBalance: number;
  personalBalance: number;
  netProfit: number;
  roiPercentage: number;
  ownerA: {
    invested: number;
    revenueHandled: number;
    expensesHandled: number;
    withdrawals: number;
    settlement: number;
    startupCosts: number;
  };
  ownerB: {
    invested: number;
    revenueHandled: number;
    expensesHandled: number;
    withdrawals: number;
    settlement: number;
    startupCosts: number;
  };
}

export interface CloudConfig {
  url: string;
  key: string;
}

export interface BankBalanceTransaction {
  id: string;
  amount: number;
  type: TransactionType;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}
