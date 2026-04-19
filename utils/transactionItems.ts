import { Transaction, TransactionItem } from '../types';

const ITEMS_PREFIX = '__ITEMS__=';

type TransactionItemLike = Partial<TransactionItem>;
type TransactionLike = Pick<Transaction, 'items' | 'categoryId' | 'description' | 'amount'>;

const stripItemsMetadataFromNotes = (notes?: string): string => {
  const text = typeof notes === 'string' ? notes : '';
  return text
    .split('\n')
    .filter(line => !line.startsWith(ITEMS_PREFIX))
    .join('\n')
    .trim();
};

const normalizeSingleItem = (item: TransactionItemLike | null | undefined, fallbackName: string): TransactionItem | null => {
  if (!item) return null;

  const categoryId = typeof item.categoryId === 'string' && item.categoryId.trim()
    ? item.categoryId.trim()
    : 'OTHER_ID';
  const name = typeof item.name === 'string' && item.name.trim()
    ? item.name.trim()
    : fallbackName;
  const price = Number(item.price);

  if (!Number.isFinite(price)) {
    return null;
  }

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    transactionId: typeof item.transactionId === 'string' ? item.transactionId : '',
    categoryId,
    name,
    price,
    notes: typeof item.notes === 'string' ? item.notes : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  };
};

export const normalizeTransactionItems = (transaction: TransactionLike): TransactionItem[] => {
  if (Array.isArray(transaction.items) && transaction.items.length > 0) {
    return transaction.items
      .map(item => normalizeSingleItem(item, transaction.description || transaction.categoryId || 'Service'))
      .filter((item): item is TransactionItem => Boolean(item));
  }

  const fallbackPrice = Number(transaction.amount);
  if (!Number.isFinite(fallbackPrice) || fallbackPrice === 0) {
    return [];
  }

  return [{
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    transactionId: '',
    categoryId: transaction.categoryId || 'OTHER_ID',
    name: transaction.description || transaction.categoryId || 'Service',
    price: fallbackPrice,
  }];
};

export const getPrimaryCategoryId = (transaction: TransactionLike): string => {
  const items = normalizeTransactionItems(transaction);
  return items[0]?.categoryId || transaction.categoryId || 'OTHER_ID';
};

export const getTransactionAmount = (transaction: TransactionLike): number => {
  const items = normalizeTransactionItems(transaction);
  return items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
};

export const getTransactionDescription = (transaction: TransactionLike): string => {
  const items = normalizeTransactionItems(transaction);
  if (items.length === 0) {
    return transaction.description || '';
  }
  if (items.length === 1) {
    return items[0].name;
  }
  return `${items[0].name} +${items.length - 1} more`;
};

export const getTransactionItemSummary = (transaction: TransactionLike): string => {
  const items = normalizeTransactionItems(transaction);
  if (items.length === 0) return transaction.description || '';
  return items.map(item => item.name).join(', ');
};

export const serializeItemsIntoNotes = (items: TransactionItem[], notes?: string): string => {
  const payload = `${ITEMS_PREFIX}${JSON.stringify(items)}`;
  const cleanNotes = stripItemsMetadataFromNotes(notes);
  return cleanNotes ? `${payload}\n${cleanNotes}` : payload;
};

export const parseItemsFromNotes = (
  notes?: string,
  fallback?: Pick<Transaction, 'items' | 'categoryId' | 'description' | 'amount'>,
): { items: TransactionItem[]; notes: string } => {
  const text = typeof notes === 'string' ? notes : '';
  const lines = text.split('\n');
  const metadataLine = lines.find(line => line.startsWith(ITEMS_PREFIX));

  if (!metadataLine) {
    return {
      items: fallback ? normalizeTransactionItems(fallback) : [],
      notes: text.trim(),
    };
  }

  try {
    const parsed = JSON.parse(metadataLine.slice(ITEMS_PREFIX.length));
    const items = Array.isArray(parsed)
      ? parsed
          .map(item => normalizeSingleItem(item, fallback?.description || fallback?.categoryId || 'Service'))
          .filter((item): item is TransactionItem => Boolean(item))
      : [];

    return {
      items: items.length > 0 ? items : (fallback ? normalizeTransactionItems(fallback) : []),
      notes: stripItemsMetadataFromNotes(text),
    };
  } catch {
    return {
      items: fallback ? normalizeTransactionItems(fallback) : [],
      notes: stripItemsMetadataFromNotes(text),
    };
  }
};
