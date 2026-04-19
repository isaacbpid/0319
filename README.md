# gardinerfinance360

## Deploy To Cloudflare Pages

### Option A: Git-Connected Deploy (Recommended)

1. Push this repo to GitHub.
2. In Cloudflare dashboard, go to Pages and create a new project.
3. Connect the GitHub repo.
4. Use these build settings:
	- Framework preset: None
	- Build command: npm run build
	- Build output directory: dist
5. Add these environment variables in Cloudflare Pages (Production and Preview):
	- SUPABASE_URL
	- SUPABASE_ANON_KEY
	- GEMINI_API_KEY (optional, only needed for receipt scan feature)
6. Deploy.

### Option B: Direct Deploy From Local

1. Build locally:
	- npm run build
2. Deploy to Cloudflare Pages:
	- npm run cf:deploy

For production branch deploy:
- npm run cf:deploy:prod

### SPA Routing

SPA fallback is already configured in public/_redirects:

/* /index.html 200

This allows deep links to app routes to load correctly.

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
