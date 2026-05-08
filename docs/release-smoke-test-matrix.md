# Suppro Release Smoke-Test Matrix

Last updated: 2026-05-08  
Repository root: `/Users/rhaminanou/Documents/suppro-mobile-app`  
App root: `/Users/rhaminanou/Documents/suppro-mobile-app/suppro`

Use this runbook before each TestFlight release candidate and before App Store submission. Keep it concise, run it on a real device, and record pass/fail for every case.

## Must Pass Before Upload

- [ ] Fresh install reaches `questionnaire -> paywall -> create account` without dead ends.
- [ ] Existing user login works for email, Apple, and Google as applicable.
- [ ] Non-entitled users can browse the app shell but premium actions show paywall.
- [ ] Premium user can complete AI chat, AI home summary, photo rescue, and image enrichment.
- [ ] Purchase, cancel, and restore flows behave correctly.
- [ ] Sign-out lands on logged-out state once, with no homepage bounce and no AI summary error.
- [ ] Delete-account leaves a fresh-start state locally and removes server-side `profiles`, `account_setup_completions`, and `edge_function_quotas`.
- [ ] Quota/rate-limit errors show friendly user copy, not raw JSON, codes, or HTTP errors.
- [ ] No GO_BACK warning, no repeat paywall loop, no anonymous session entering authenticated tabs.

## Backend Prerequisites

These must already be deployed before running this sheet:

- Latest Supabase migrations, including RLS and `edge_function_quotas`.
- Latest Edge Functions:
  - `ai-supplement`
  - `scan-supplement-photos`
  - `enrich-product-image`
  - `queue-missing-active-ingredients`
  - `delete-account`
  - `lookup-apple-account`
- RevenueCat products, entitlement, offerings, and app keys configured in the target environment.
- OpenAI and SerpApi secrets configured for the target Supabase project.

## Test Personas

- `Fresh user`: no prior account, fresh install.
- `Premium user`: active entitlement.
- `Non-entitled user`: valid account, no active entitlement.
- `Deleted-account user`: account deleted during this test pass.

## 1. Fresh Install Onboarding

### Test 1.1: First run reaches questionnaire
- Preconditions: Clean install, no existing app storage, no signed-in session.
- Steps:
  1. Install and open the TestFlight build.
  2. Wait for initial routing to settle.
- Expected result: App opens to questionnaire, not login, paywall, or tabs.
- [ ] Pass
- [ ] Fail

### Test 1.2: Questionnaire completion goes to paywall
- Preconditions: Fresh user on questionnaire.
- Steps:
  1. Complete questionnaire with valid answers.
  2. Submit the questionnaire.
- Expected result: App routes to first-run paywall. It must not skip directly to signup or tabs.
- [ ] Pass
- [ ] Fail

### Test 1.3: Paywall completion goes to create account
- Preconditions: Fresh user at onboarding paywall.
- Steps:
  1. Complete purchase with sandbox account.
  2. Allow app to return from purchase flow.
- Expected result: App routes to create-account/signup flow, not back to questionnaire or repeat paywall.
- [ ] Pass
- [ ] Fail

### Test 1.4: Paywall cancellation is safe
- Preconditions: Fresh user at onboarding paywall.
- Steps:
  1. Open purchase flow.
  2. Cancel purchase.
- Expected result: App lands on safe logged-out route and is not stranded on a spinner or broken back stack.
- [ ] Pass
- [ ] Fail

## 2. Purchase And Subscription Gating

### Test 2.1: Premium purchase unlocks premium actions
- Preconditions: Fresh or existing non-entitled user.
- Steps:
  1. Trigger paywall from onboarding or a premium action.
  2. Complete purchase.
  3. Open AI chat and AI home summary.
- Expected result: Premium actions work without showing paywall again.
- [ ] Pass
- [ ] Fail

### Test 2.2: Cancelled paywall does not unlock premium
- Preconditions: Non-entitled user.
- Steps:
  1. Trigger paywall from a premium action.
  2. Cancel the paywall.
  3. Retry the premium action.
- Expected result: User stays non-entitled, app shell remains usable, premium action still requires paywall.
- [ ] Pass
- [ ] Fail

### Test 2.3: Restore purchases works
- Preconditions: User with a previously purchased entitlement on the same sandbox account.
- Steps:
  1. Open Settings.
  2. Tap Restore Purchases.
  3. Recheck premium action access.
- Expected result: Restore succeeds and premium access becomes active again.
- [ ] Pass
- [ ] Fail

### Test 2.4: Expired or no-entitlement user can browse shell only
- Preconditions: Non-entitled user.
- Steps:
  1. Sign in with non-entitled account.
  2. Browse home, supplement detail, and settings.
  3. Trigger AI chat, AI summary refresh, and photo rescue.
- Expected result: App shell is accessible. Premium actions show paywall and do not fail open.
- [ ] Pass
- [ ] Fail

## 3. OAuth And Account Creation

### Test 3.1: Existing Apple login works in login mode
- Preconditions: Existing Apple-linked Suppro account with `account_setup_completions`.
- Steps:
  1. Open login flow in login mode.
  2. Continue with Apple.
- Expected result: Existing user enters the app successfully.
- [ ] Pass
- [ ] Fail

### Test 3.2: Existing Google login works in login mode
- Preconditions: Existing Google-linked Suppro account with `account_setup_completions`.
- Steps:
  1. Open login flow in login mode.
  2. Continue with Google.
- Expected result: Existing user enters the app successfully.
- [ ] Pass
- [ ] Fail

### Test 3.3: Brand-new OAuth login is rejected in login mode
- Preconditions: Apple or Google identity with no existing Suppro account.
- Steps:
  1. Open login flow in login mode.
  2. Attempt OAuth sign-in with brand-new identity.
- Expected result: User is not let into authenticated tabs. App returns to safe logged-out/create-account path.
- [ ] Pass
- [ ] Fail

### Test 3.4: Brand-new OAuth create-account flow works
- Preconditions: Apple or Google identity with no existing Suppro account.
- Steps:
  1. Start create-account flow.
  2. Complete OAuth sign-up.
  3. Finish account creation.
- Expected result: Account setup completes and user enters the app as a valid signed-in user.
- [ ] Pass
- [ ] Fail

## 4. Sign-Out

### Test 4.1: One-press sign-out lands once on logged-out route
- Preconditions: Signed-in user in app shell.
- Steps:
  1. Open Account.
  2. Tap Sign out once.
- Expected result: App navigates once to logged-out/login route with no duplicate flash or bounce to tabs.
- [ ] Pass
- [ ] Fail

### Test 4.2: Sign-out shows no scary AI summary error
- Preconditions: Premium user on home while AI summary may still load.
- Steps:
  1. Open home screen.
  2. Immediately sign out.
- Expected result: No visible AI summary error and no dev-style auth failure message.
- [ ] Pass
- [ ] Fail

### Test 4.3: Sign-out does not leak prior user data
- Preconditions: Signed-in user with health data, AI chat history, and favourites/tracked data.
- Steps:
  1. Sign out.
  2. Sign in as a different user or remain logged out.
  3. Inspect home, AI chat, health state, and tracked supplements.
- Expected result: No prior user private data is visible. Normal sign-out still preserves intended account-scoped supplement persistence for the original user only.
- [ ] Pass
- [ ] Fail

## 5. Delete Account

### Test 5.1: Delete-account lands in fresh-start state
- Preconditions: Signed-in user with existing local data and premium/subscription state.
- Steps:
  1. Open Account.
  2. Tap Delete account and confirm.
  3. Relaunch the app.
- Expected result: App opens in fresh-start logged-out state with no stale signed-in session or stale premium state.
- [ ] Pass
- [ ] Fail

### Test 5.2: Deleted identity is rejected in login mode
- Preconditions: Account was deleted in Test 5.1.
- Steps:
  1. Attempt login-mode Apple sign-in for the deleted identity.
  2. Attempt login-mode Google sign-in for the deleted identity if applicable.
- Expected result: Deleted identity is not treated as an existing Suppro login and does not enter authenticated tabs.
- [ ] Pass
- [ ] Fail

### Test 5.3: Server-side delete cleanup is complete
- Preconditions: Access to Supabase dashboard or SQL editor.
- Steps:
  1. Find the deleted user id.
  2. Verify absence of rows in `profiles`.
  3. Verify absence of rows in `account_setup_completions`.
  4. Verify absence of rows in `edge_function_quotas`.
- Expected result: All three are gone for the deleted user.
- [ ] Pass
- [ ] Fail

## 6. Premium Functions

### Test 6.1: AI chat works for entitled user
- Preconditions: Premium user.
- Steps:
  1. Open AI chat.
  2. Send a normal prompt.
- Expected result: Response succeeds normally with no paywall and no quota error on first attempt.
- [ ] Pass
- [ ] Fail

### Test 6.2: AI home summary works for entitled user
- Preconditions: Premium user with enough home data to generate a summary.
- Steps:
  1. Open home screen.
  2. Wait for summary hydrate or live generation.
- Expected result: Summary appears normally with no auth race error.
- [ ] Pass
- [ ] Fail

### Test 6.3: Photo rescue works for entitled user
- Preconditions: Premium user and a supplement photo that should parse successfully.
- Steps:
  1. Open photo rescue flow.
  2. Upload or capture a valid image.
- Expected result: Photo rescue completes or returns normal app fallback, without technical errors.
- [ ] Pass
- [ ] Fail

### Test 6.4: Image enrichment stays best-effort
- Preconditions: Product detail path that triggers enrichment.
- Steps:
  1. Open product detail that can enrich image.
  2. Observe image behaviour.
- Expected result: Existing image or fallback remains usable. Enrichment must not block the page.
- [ ] Pass
- [ ] Fail

## 7. Quota And Rate-Limit Errors

### Test 7.1: AI quota error is friendly
- Preconditions: Ability to trigger AI quota/rate-limit response for a premium account.
- Steps:
  1. Repeatedly trigger AI chat or summary until limit is reached.
- Expected result: User sees friendly retry copy, not raw JSON, quota codes, or HTTP status.
- [ ] Pass
- [ ] Fail

### Test 7.2: Photo rescue quota error is friendly
- Preconditions: Ability to trigger photo-rescue quota/rate-limit response.
- Steps:
  1. Repeatedly trigger photo rescue until limit is reached.
- Expected result: Friendly message is shown. No raw backend details appear.
- [ ] Pass
- [ ] Fail

### Test 7.3: Image enrichment quota error fails quietly
- Preconditions: Ability to trigger image-enrichment quota/rate-limit response.
- Steps:
  1. Repeatedly open enrichment-triggering product detail.
- Expected result: Product still renders with fallback image behaviour and no scary technical error.
- [ ] Pass
- [ ] Fail

## 8. RLS And Client Catalog Reads

### Test 8.1: Public catalog reads still work
- Preconditions: Logged-out user and signed-in user.
- Steps:
  1. Search supplements.
  2. Open supplement detail.
  3. Open a product detail that depends on catalog/reference tables.
- Expected result: Safe catalog/reference data reads succeed for intended app flows.
- [ ] Pass
- [ ] Fail

### Test 8.2: Private user data stays protected
- Preconditions: Two distinct user accounts.
- Steps:
  1. Sign in as User A and create some local/server state.
  2. Sign out and sign in as User B.
  3. Inspect account/profile and user-specific surfaces.
- Expected result: User B cannot see User A private data. No private-table leak through client reads.
- [ ] Pass
- [ ] Fail

## 9. Settings And Account Management

### Test 9.1: Manage subscription works
- Preconditions: Build with RevenueCat available.
- Steps:
  1. Open Settings.
  2. Tap Manage Subscription.
- Expected result: Subscription management opens through the provider path without crash.
- [ ] Pass
- [ ] Fail

### Test 9.2: Restore purchases in Settings works
- Preconditions: Previously purchased account.
- Steps:
  1. Open Settings.
  2. Tap Restore Purchases.
- Expected result: Restore result is sensible, user-safe, and updates entitlement state.
- [ ] Pass
- [ ] Fail

### Test 9.3: Questionnaire retake from Settings still works
- Preconditions: Signed-in user.
- Steps:
  1. Open Settings or Account path that retakes questionnaire.
  2. Complete the retake.
- Expected result: Retake works without breaking routing or forcing repeat first-run paywall.
- [ ] Pass
- [ ] Fail

## 10. Regression Checks

### Test 10.1: No GO_BACK warning
- Preconditions: Normal navigation through onboarding, settings, paywall, and account screens.
- Steps:
  1. Use back navigation across those flows.
  2. Watch device logs and visible UI behaviour.
- Expected result: No unsafe `GO_BACK` warning and no broken back-stack behaviour.
- [ ] Pass
- [ ] Fail

### Test 10.2: No repeat paywall after successful purchase
- Preconditions: User who has just completed purchase.
- Steps:
  1. Return from purchase.
  2. Continue onboarding or premium action flow.
- Expected result: App does not reopen paywall immediately after success.
- [ ] Pass
- [ ] Fail

### Test 10.3: Anonymous session cannot enter authenticated tabs
- Preconditions: Fresh install or signed-out state.
- Steps:
  1. Open app without real login.
  2. Try to reach authenticated tabs by navigation or deep-link style flows.
- Expected result: No anonymous session is treated as a real authenticated app user.
- [ ] Pass
- [ ] Fail

## Sign-Off

- Build version:
- Environment:
- Device:
- Tester:
- Date:
- Result:
  - [ ] Pass for upload
  - [ ] Block upload
- Notes:
