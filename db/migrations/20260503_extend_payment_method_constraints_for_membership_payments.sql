-- Extend payment method constraints to support membership-based payments.
-- Required for checkout_sales and transactions rows that use PREPAID or POINTS.

ALTER TABLE checkout_sales
  DROP CONSTRAINT IF EXISTS checkout_sales_payment_method_valid;

ALTER TABLE checkout_sales
  ADD CONSTRAINT checkout_sales_payment_method_valid
  CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'FPS',
      'Payme',
      'HKD_cash',
      'RMB_cash',
      'Alipay',
      'wechat',
      'MOP_cash',
      'MPay',
      'POINTS',
      'PREPAID'
    )
  );

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_valid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_method_valid
  CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'FPS',
      'Payme',
      'HKD_cash',
      'RMB_cash',
      'Alipay',
      'wechat',
      'MOP_cash',
      'MPay',
      'POINTS',
      'PREPAID'
    )
  );

NOTIFY pgrst, 'reload schema';
