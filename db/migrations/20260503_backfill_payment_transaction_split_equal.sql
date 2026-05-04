-- Backfill split fields for payment transactions.
-- Ensures analysis and partner-share logic use EQUAL 50/50 when payment_method is present.

UPDATE transactions
SET
  split_mode = 'EQUAL',
  split_ratio_a = 0.5,
  split_ratio_b = 0.5,
  updated_at = now()
WHERE payment_method IS NOT NULL
  AND (
    split_mode IS NULL
    OR split_ratio_a IS NULL
    OR split_ratio_b IS NULL
  );
