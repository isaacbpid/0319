import { Owner, Transaction } from '../types';

export const DEFAULT_SPLIT_RATIO_A = 0.5;
export const DEFAULT_SPLIT_RATIO_B = 0.5;

const normalizeRatio = (value?: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
};

export const getTransactionSplit = (transaction: Partial<Transaction>) => {
  const splitMode = transaction.splitMode === 'EQUAL' ? 'EQUAL' : 'NONE';
  const ratioA = normalizeRatio(transaction.splitRatioA);
  const ratioB = normalizeRatio(transaction.splitRatioB);

  if (splitMode === 'EQUAL') {
    const baseA = ratioA ?? DEFAULT_SPLIT_RATIO_A;
    const baseB = ratioB ?? DEFAULT_SPLIT_RATIO_B;
    const total = baseA + baseB;

    if (total > 0) {
      return {
        isSplit: true,
        splitMode: 'EQUAL' as const,
        splitRatioA: baseA / total,
        splitRatioB: baseB / total,
      };
    }
  }

  if (ratioA !== null || ratioB !== null) {
    const baseA = ratioA ?? 0;
    const baseB = ratioB ?? 0;
    const total = baseA + baseB;

    if (total > 0 && !(baseA === 1 && baseB === 0)) {
      return {
        isSplit: true,
        splitMode: 'EQUAL' as const,
        splitRatioA: baseA / total,
        splitRatioB: baseB / total,
      };
    }
  }

  return {
    isSplit: false,
    splitMode: 'NONE' as const,
    splitRatioA: 1,
    splitRatioB: 0,
  };
};

export const isSplitTransaction = (transaction: Partial<Transaction>): boolean => {
  return getTransactionSplit(transaction).isSplit;
};

export const getOwnerShareRatio = (transaction: Partial<Transaction>, owner: Owner, aliases: string[] = []): number => {
  const split = getTransactionSplit(transaction);
  if (split.isSplit) {
    return owner === Owner.OWNER_A ? split.splitRatioA : split.splitRatioB;
  }

  const contributor = typeof transaction.contributedBy === 'string' ? transaction.contributedBy.trim() : '';
  if (!contributor) {
    return 0;
  }

  const matchSet = new Set(
    [owner, ...aliases]
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  );

  return matchSet.has(contributor) ? 1 : 0;
};

export const getSplitDisplayLabel = (transaction: Partial<Transaction>, language: 'zh' | 'en'): string => {
  const split = getTransactionSplit(transaction);
  if (!split.isSplit) {
    return typeof transaction.contributedBy === 'string' ? transaction.contributedBy : '';
  }

  const pctA = Math.round(split.splitRatioA * 100);
  const pctB = Math.round(split.splitRatioB * 100);
  return language === 'zh'
    ? `User 1 ${pctA}% / User 2 ${pctB}%`
    : `User 1 ${pctA}% / User 2 ${pctB}%`;
};