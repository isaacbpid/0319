# gardinerfinance360

## Accounts Type Alignment

The app uses these canonical values for accounts.type:

- company_bank
- partner_personal
- cash
- wechat
- alipay
- other

Legacy value Owner is treated as partner_personal in application code.

Run this SQL in Supabase to enforce allowed values at database level:

```sql
ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts
ADD CONSTRAINT accounts_type_check
CHECK (type IN ('company_bank', 'partner_personal', 'cash', 'wechat', 'alipay', 'other'));
```
