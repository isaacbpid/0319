
import { createClient } from '@supabase/supabase-js';
import { Transaction, TransactionType, CloudConfig, AuditAction, AuditLog, Note, CategoryItem, Customer, BankBalanceTransaction, Account } from '../types';

let supabase: any = null;

export type SyncRemoteTransactionsResult = {
  success: boolean;
  error?: string;
  details?: string;
  code?: 'VALIDATION_ERROR' | 'DUPLICATE_ID' | 'UPSERT_ERROR' | 'SUPABASE_NOT_INITIALIZED' | 'EXCEPTION';
  failedTransactionIds?: string[];
  failedChunkIndex?: number;
  attemptedCount?: number;
  completedChunks?: number;
};

type SyncedTransactionRow = {
  id: string;
  receipt_number: string;
  occurred_at: string;
  type: TransactionType;
  category_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  description: string;
  contributed_by: string;
  updated_at: string;
  image_url: string | null;
  is_initial_investment: boolean;
  notes: string;
  customer_id: string | null;
};

const VALID_TRANSACTION_TYPES = new Set(Object.values(TransactionType));

const normalizeNullableText = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeRequiredText = (value?: string): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeOccurredAt = (value?: string): string | null => {
  const raw = normalizeRequiredText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeIsoTimestamp = (value?: string): string => {
  const raw = normalizeRequiredText(value);
  if (!raw) return new Date().toISOString();

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const buildReceiptNumber = (transaction: Transaction): string => {
  const existing = normalizeRequiredText(transaction.receiptNumber);
  if (existing) return existing;

  const normalizedId = normalizeRequiredText(transaction.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = (normalizedId.slice(-6) || Date.now().toString().slice(-6)).padStart(6, '0');
  return `REC-${suffix}`;
};

const isValidTransactionId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(id);

const normalizeTransactionForSync = (transaction: Transaction): { row?: SyncedTransactionRow; errors: string[] } => {
  const errors: string[] = [];
  const id = normalizeRequiredText(transaction.id);
  const occurredAt = normalizeOccurredAt(transaction.date);
  const categoryId = normalizeRequiredText(transaction.categoryId);
  const contributedBy = normalizeRequiredText(transaction.contributedBy);
  const type = transaction.type;
  const amount = Number(transaction.amount);

  if (!id) {
    errors.push('Missing id');
  } else if (!isValidTransactionId(id)) {
    errors.push('Invalid id format');
  }

  if (!VALID_TRANSACTION_TYPES.has(type)) {
    errors.push(`Invalid type: ${String(type)}`);
  }

  if (!occurredAt) {
    errors.push('Invalid occurred_at/date value');
  }

  if (!categoryId) {
    errors.push('Missing category_id');
  }

  if (!contributedBy && type !== TransactionType.REVENUE) {
    errors.push('Missing contributed_by');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Amount must be a number greater than 0');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    row: {
      id,
      receipt_number: buildReceiptNumber(transaction),
      occurred_at: occurredAt!,
      type,
      category_id: categoryId,
      from_account_id: normalizeNullableText(transaction.fromAccountId),
      to_account_id: normalizeNullableText(transaction.toAccountId),
      amount,
      description: normalizeRequiredText(transaction.description),
      contributed_by: contributedBy,
      updated_at: normalizeIsoTimestamp(transaction.updatedAt),
      image_url: normalizeNullableText(transaction.imageUrl),
      is_initial_investment: Boolean(transaction.isInitialInvestment),
      notes: normalizeRequiredText(transaction.notes),
      customer_id: normalizeNullableText(transaction.customerId)
    },
    errors
  };
};

export const initSupabase = (config: CloudConfig) => {
  console.log("initSupabase called with config:", { ...config, key: config.key ? "PRESENT" : "MISSING" });
  if (!config.url || !config.key) {
    console.warn("Supabase URL or Key missing in config!");
    return null;
  }
  try {
    const url = config.url.trim().replace(/\/$/, "");
    const key = config.key.trim();
    supabase = createClient(url, key);
    console.log("Supabase client created successfully.");
    return supabase;
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    return null;
  }
};

// Internal retry wrapper for stability
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isNetworkError = err instanceof Error && 
        (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('timeout'));
      
      if (!isNetworkError || i === maxRetries - 1) throw err;
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

export const logAuditEvent = async (
  action: AuditAction, 
  tableName: string, 
  recordId?: string, 
  changedBy?: string, 
  oldData?: any, 
  newData?: any
) => {
  if (!supabase) return;
  
  const log = {
    action,
    table_name: tableName,
    record_id: recordId,
    changed_by: changedBy,
    old_data: oldData,
    new_data: newData,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('audit_logs').insert(log);
    if (error) console.error('Audit Log Error:', error);
  } catch (e) {
    console.error('Audit Log Exception:', e);
  }
};

export const fetchAuditLogs = async (): Promise<{ data: AuditLog[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      return { data: null, error: error.message };
    }

    const mappedData = data?.map((l: any) => ({
      id: l.id,
      action: l.action,
      tableName: l.table_name,
      recordId: l.record_id,
      changedBy: l.changed_by,
      oldData: l.old_data,
      newData: l.new_data,
      createdAt: l.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
};

export const testConnection = async (config: CloudConfig): Promise<{ success: boolean; message: string; details?: string }> => {
  try {
    const tempClient = createClient(config.url.trim(), config.key.trim());
    
    // 1. Check Table Existence and Columns
    const { error: readError } = await tempClient.from('transactions').select('id, from_account_id, to_account_id').limit(1);
    const { error: notesError } = await tempClient.from('notes').select('id').limit(1);
    const { error: accountsError } = await tempClient.from('accounts').select('id, name, type').limit(1);
    const { error: customersError } = await tempClient.from('customers').select('id').limit(1);
    
    if (readError || notesError || accountsError || customersError) {
      const missingTable = 
        (readError && readError.code === '42P01') ? 'transactions' :
        (notesError && notesError.code === '42P01') ? 'notes' :
        (accountsError && accountsError.code === '42P01') ? 'accounts' :
        (customersError && customersError.code === '42P01') ? 'customers' : null;

      if (missingTable) {
        return { 
          success: false, 
          message: `Table "${missingTable}" NOT FOUND`,
          details: `The "${missingTable}" table does not exist. Please run the SQL script in Supabase SQL Editor.`
        };
      }

      // Check for missing columns
      if (readError && (readError.message.includes('column "from_account_id" does not exist') || readError.message.includes('column "to_account_id" does not exist'))) {
        return { success: false, message: 'Columns MISSING in "transactions"', details: 'The "transactions" table is missing "from_account_id" or "to_account_id" columns. Please add them to your Supabase schema.' };
      }
      if (accountsError && (accountsError.message.includes('column "name" does not exist') || accountsError.message.includes('column "type" does not exist'))) {
        return { success: false, message: 'Column MISSING in "accounts"', details: 'The "accounts" table is missing required columns (name, type). Please update your Supabase schema.' };
      }

      return { success: false, message: `System Error: ${readError?.code || notesError?.code || accountsError?.code || customersError?.code}`, details: readError?.message || notesError?.message || accountsError?.message || customersError?.message };
    }

    // 2. Check Write Access (Permissions Check)
    const testId = "DIAGNOSTIC_" + Date.now();
    const { error: writeError } = await tempClient.from('transactions').upsert({
      id: testId,
      amount: 0,
      occurred_at: new Date().toISOString().substring(0, 10),
      type: 'EXPENSE',
      category_id: 'OTHER_ID',
      contributed_by: 'User 1',
      description: 'System Permissions Test'
    });

    if (writeError) {
      if (writeError.message.includes('permission denied')) {
        return {
          success: false,
          message: 'WRITE DENIED',
          details: 'The table exists, but your API key is blocked. Run "ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;" in SQL Editor.'
        };
      }
      return {
        success: false,
        message: 'DATABASE REJECTED WRITE',
        details: writeError.message
      };
    }

    // Cleanup test record
    await tempClient.from('transactions').delete().eq('id', testId);
    
    return { 
      success: true, 
      message: 'CONNECTION PERFECT', 
      details: 'Read and Write permissions are active. Your data will now sync safely.' 
    };
  } catch (e: any) {
    return { 
      success: false, 
      message: 'NETWORK ERROR', 
      details: e.message || 'Check your Supabase URL or internet connection.'
    };
  }
};

export const fetchRemoteTransactions = async (): Promise<{ data: Transaction[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: false })) as any;
    
    if (error) {
      console.error('Supabase Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((t: any) => ({
      id: t.id,
      receiptNumber: t.receipt_number,
      date: typeof t.occurred_at === 'string' ? t.occurred_at.slice(0, 10) : t.occurred_at,
      type: t.type,
      categoryId: t.category_id,
      fromAccountId: t.from_account_id,
      toAccountId: t.to_account_id,
      amount: t.amount,
      description: t.description,
      contributedBy: t.contributed_by,
      updatedAt: t.updated_at,
      imageUrl: t.image_url,
      isInitialInvestment: t.is_initial_investment,
      notes: t.notes,
      customerId: t.customer_id
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    console.error('Fetch exception:', e);
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const subscribeToTransactions = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('any')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => onUpdate())
    .subscribe();
};

export const syncRemoteTransactions = async (transactions: Transaction[]): Promise<SyncRemoteTransactionsResult> => {
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase not initialized',
      code: 'SUPABASE_NOT_INITIALIZED',
      attemptedCount: transactions.length,
      completedChunks: 0
    };
  }
  if (transactions.length === 0) return { success: true };

  try {
    const validationFailures: string[] = [];
    const cleanTransactions: SyncedTransactionRow[] = [];
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const transaction of transactions) {
      const normalized = normalizeTransactionForSync(transaction);
      if (!normalized.row) {
        const idForError = normalizeRequiredText(transaction.id) || '(missing-id)';
        validationFailures.push(`${idForError}: ${normalized.errors.join(', ')}`);
        continue;
      }

      if (seenIds.has(normalized.row.id)) {
        duplicateIds.add(normalized.row.id);
      } else {
        seenIds.add(normalized.row.id);
      }

      cleanTransactions.push(normalized.row);
    }

    if (duplicateIds.size > 0) {
      const ids = Array.from(duplicateIds);
      return {
        success: false,
        error: `Duplicate transaction IDs in batch: ${ids.join(', ')}`,
        details: 'Each transaction in a sync batch must have a unique id.',
        code: 'DUPLICATE_ID',
        failedTransactionIds: ids,
        attemptedCount: transactions.length,
        completedChunks: 0
      };
    }

    if (validationFailures.length > 0) {
      const failedIds = validationFailures
        .map(f => f.split(':')[0])
        .filter(Boolean);

      return {
        success: false,
        error: `Transaction validation failed for ${validationFailures.length} row(s).`,
        details: validationFailures.slice(0, 5).join(' | '),
        code: 'VALIDATION_ERROR',
        failedTransactionIds: failedIds,
        attemptedCount: transactions.length,
        completedChunks: 0
      };
    }

    const chunkSize = 5; // Slightly larger chunks for speed
    let completedChunks = 0;
    for (let i = 0; i < cleanTransactions.length; i += chunkSize) {
      const chunk = cleanTransactions.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      const { error } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'id' });
      
      if (error) {
        const failedIds = chunk.map(row => row.id);
        console.error('Sync Chunk Error:', { chunkIndex, failedIds, error });
        return {
          success: false,
          error: `[chunk ${chunkIndex + 1}] ${error.message}`,
          details: `Failed transaction IDs: ${failedIds.join(', ')}`,
          code: 'UPSERT_ERROR',
          failedTransactionIds: failedIds,
          failedChunkIndex: chunkIndex,
          attemptedCount: cleanTransactions.length,
          completedChunks
        };
      }

      completedChunks += 1;
    }
    
    return {
      success: true,
      attemptedCount: cleanTransactions.length,
      completedChunks
    };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Unexpected sync exception',
      code: 'EXCEPTION',
      attemptedCount: transactions.length
    };
  }
};

export const deleteRemoteTransaction = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const fetchRemoteNotes = async (): Promise<{ data: Note[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      console.error('Supabase Notes Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((n: any) => ({
      id: n.id,
      content: n.content,
      createdBy: n.created_by,
      createdAt: n.created_at,
      updatedAt: n.updated_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteNotes = async (notes: Note[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (notes.length === 0) return { success: true };

  try {
    const cleanNotes = notes.map(n => ({
      id: n.id,
      content: n.content || '',
      created_by: n.createdBy,
      created_at: n.createdAt || new Date().toISOString(),
      updated_at: n.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('notes')
      .upsert(cleanNotes, { onConflict: 'id' });
    
    if (error) {
      console.error('Notes Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteNote = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const clearAllRemoteData = async (): Promise<boolean> => {
  if (!supabase) return false;
  try {
    // Delete all rows by using a filter that matches everything
    const { error: trError } = await supabase.from('transactions').delete().neq('id', '_RESET_');
    const { error: notesError } = await supabase.from('notes').delete().neq('id', '_RESET_');
    return !trError && !notesError;
  } catch (e) {
    console.error('Clear data error:', e);
    return false;
  }
};

export const subscribeToNotes = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('notes_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteCategories = async (): Promise<{ data: CategoryItem[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Categories Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      createdAt: c.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCategories = async (categories: CategoryItem[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (categories.length === 0) return { success: true };

  try {
    const cleanCategories = categories.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      created_at: c.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('categories')
      .upsert(cleanCategories, { onConflict: 'id' });
    
    if (error) {
      console.error('Categories Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteCategory = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const fetchRemoteBankBalanceTransactions = async (): Promise<{ data: BankBalanceTransaction[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('bank_balance_transactions')
      .select('*')
      .order('created_at', { ascending: false })) as any;
    
    if (error) {
      console.error('Supabase Bank Balance Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceBefore: t.balance_before,
      balanceAfter: t.balance_after,
      createdAt: t.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteBankBalanceTransactions = async (transactions: BankBalanceTransaction[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (transactions.length === 0) return { success: true };

  try {
    const cleanTransactions = transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balance_before: t.balanceBefore,
      balance_after: t.balanceAfter,
      created_at: t.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('bank_balance_transactions')
      .upsert(cleanTransactions, { onConflict: 'id' });
    
    if (error) {
      console.error('Bank Balance Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const subscribeToBankBalanceTransactions = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('bank_balance_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_balance_transactions' }, () => onUpdate())
    .subscribe();
};

export const subscribeToCategories = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('categories_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => onUpdate())
    .subscribe();
};

export const fetchRemoteCustomers = async (): Promise<{ data: Customer[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('customers')
      .select('*')
      .order('name', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Customers Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      vehicleMake: c.vehicle_make,
      vehicleModel: c.vehicle_model,
      vehicleColor: c.vehicle_color,
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteCustomers = async (customers: Customer[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (customers.length === 0) return { success: true };

  try {
    const cleanCustomers = customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone || null,
      vehicle_make: c.vehicleMake || null,
      vehicle_model: c.vehicleModel || null,
      vehicle_color: c.vehicleColor || null,
      notes: c.notes || null,
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('customers')
      .upsert(cleanCustomers, { onConflict: 'id' });
    
    if (error) {
      console.error('Customers Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteCustomer = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      console.error('Supabase Delete Customer Error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Delete Customer Exception:', e);
    return false;
  }
};

export const subscribeToCustomers = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('customers_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => onUpdate())
    .subscribe();
};

export const checkActiveSessions = async (): Promise<{ active: boolean; error?: string }> => {
  if (!supabase) return { active: false, error: 'Supabase not initialized' };
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('admin_sessions')
      .select('*')
      .gt('expires_at', now);
    
    if (error) return { active: false, error: error.message };
    return { active: data && data.length > 0 };
  } catch (e: any) {
    return { active: false, error: e.message };
  }
};

export const createAdminSession = async (partnerId: string, sessionToken: string, expiresAt: string): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  try {
    const { error } = await supabase
      .from('admin_sessions')
      .upsert({ partner_id: partnerId, session_token: sessionToken, expires_at: expiresAt });
    
    return { success: !error, error: error?.message };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const updateAdminSession = async (sessionToken: string, expiresAt: string): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .update({ expires_at: expiresAt })
      .eq('session_token', sessionToken);
  } catch (e) {
    console.error('Session update error:', e);
  }
};

export const clearAdminSession = async (sessionToken: string): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .delete()
      .eq('session_token', sessionToken);
  } catch (e) {
    console.error('Session clear error:', e);
  }
};

export const clearAllAdminSessions = async (): Promise<void> => {
  if (!supabase) return;
  try {
    await supabase
      .from('admin_sessions')
      .delete()
      .neq('id', '_RESET_');
  } catch (e) {
    console.error('Clear all sessions error:', e);
  }
};

export const fetchRemoteAccounts = async (): Promise<{ data: Account[] | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  try {
    const { data, error } = await withRetry(() => supabase!
      .from('accounts')
      .select('*')
      .order('name', { ascending: true })) as any;
    
    if (error) {
      console.error('Supabase Accounts Fetch Error:', error);
      return { data: null, error: `[${error.code}] ${error.message}` };
    }

    const mappedData = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      createdAt: a.created_at
    }));

    return { data: mappedData, error: undefined };
  } catch (e: any) {
    return { data: null, error: e.message || 'Unknown network error' };
  }
};

export const syncRemoteAccounts = async (accounts: Account[]): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };
  if (accounts.length === 0) return { success: true };

  try {
    const cleanAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      created_at: a.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase
      .from('accounts')
      .upsert(cleanAccounts, { onConflict: 'id' });
    
    if (error) {
      console.error('Accounts Sync Error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const deleteRemoteAccount = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    return !error;
  } catch (e) {
    return false;
  }
};

export const subscribeToAccounts = (onUpdate: () => void) => {
  if (!supabase) return null;
  return supabase
    .channel('accounts_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => onUpdate())
    .subscribe();
};

export const getServerTime = async (): Promise<string | null> => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_server_time');
    if (error) {
      // Fallback if RPC doesn't exist: use a simple query
      const { data: timeData } = await supabase.from('admin_sessions').select('last_active').limit(1);
      return new Date().toISOString(); // Default fallback
    }
    return data;
  } catch (e) {
    return new Date().toISOString();
  }
};
