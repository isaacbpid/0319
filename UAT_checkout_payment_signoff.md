# UAT Sign-Off Sheet: Checkout Payment -> Transactions

Date:
Tester:
Environment:
Build/Commit:
Supabase Project Ref:

## Objective
Validate that checkout orders are posted to transactions only when paid, with strict method-currency rules and no duplicate postings.

## Preconditions
- [ ] Migration `20260418_checkout_payment_to_transactions.sql` has been applied.
- [ ] App points to the correct Supabase project.
- [ ] At least one customer and one active service category exist.
- [ ] You can open Checkout, Transactions, and Dashboard/Stats pages.

## Baseline Snapshot
- Transactions count before test:
- Service stats before test:
- Timestamp baseline captured:

---

## Test Execution Log

| TC ID | Scenario | Steps Performed | Expected Result | Actual Result | Status (PASS/FAIL) | Evidence (screenshot/sql) | Notes/Bug ID |
|---|---|---|---|---|---|---|---|
| TC-01 | Unpaid checked_out does not post | Create checked_out unpaid order; do not click Mark Paid & Post; check Transactions/Stats | No new transaction, stats unchanged |  |  |  |  |
| TC-02 | Paid posting creates linked transaction | On pending checked_out order choose FPS + RMB; click Mark Paid & Post | checkout payment_status=paid, paid_amount set, linked_transaction_id set; one transaction with checkout_order_id created |  |  |  |  |
| TC-03 | Cash mapping: HKD_cash | Use HKD_cash and try non-HKD currency | Invalid mapping blocked (or auto-forced HKD) |  |  |  |  |
| TC-04 | Cash mapping: RMB_cash | Use RMB_cash and try non-RMB currency | Invalid mapping blocked (or auto-forced RMB) |  |  |  |  |
| TC-05 | Cash mapping: MOP_cash | Use MOP_cash and try non-MOP currency | Invalid mapping blocked (or auto-forced MOP) |  |  |  |  |
| TC-06 | Non-cash accepts selected currency | Use Alipay + HKD; wechat + MOP on separate orders | Both post successfully with exact method/currency persisted |  |  |  |  |
| TC-07 | Idempotency/no duplicate transaction | Retry paid-post action on same order (or refresh and retry) | No duplicate transaction; still one row per checkout_order_id |  |  |  |  |
| TC-08 | Reporting consistency | Sum posted test order amounts and compare stats delta | Stats delta equals posted transaction totals |  |  |  |  |

---

## Optional SQL Evidence

### 1) Linked transaction for an order
```sql
select id, checkout_order_id, amount, payment_status, payment_method, payment_currency
from transactions
where checkout_order_id = '<order_id>';
```

### 2) Duplicate protection check
```sql
select checkout_order_id, count(*)
from transactions
where checkout_order_id is not null
group by checkout_order_id
having count(*) > 1;
```

### 3) Checkout payment state check
```sql
select id, status, payment_status, payment_method, payment_currency, paid_amount, linked_transaction_id
from checkout_sales
where id = '<order_id>';
```

---

## Sign-Off

### Summary
- Total test cases executed:
- Passed:
- Failed:
- Blocked:

### Go/No-Go
- [ ] GO (Ready for production)
- [ ] NO-GO (Requires fixes)

Approved by:
Date:
Comments:
