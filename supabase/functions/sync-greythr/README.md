# `sync-greythr`

Supabase Edge Function that performs the reverse-engineered greytHR login handshake:

1. Bootstrap the login page and capture the `login_challenge` plus initial cookies.
2. Fetch the JWKS RSA key.
3. Encrypt the plaintext password with the greytHR public key.
4. POST the encrypted credentials with the OAuth challenge header.
5. Return the authenticated cookie jar so downstream attendance scraping can reuse it.
6. Fetch biometric swipe data for the current month when `greythrUserId` is supplied.

## Request body

```json
{
  "userName": "EMP001",
  "password": "plain-text-password",
  "greythrUserId": "123456",
  "loginChallenge": "optional-known-challenge",
  "refererUrl": "optional-login-url-containing-challenge",
  "dryRun": false
}
```

`loginChallenge` or `refererUrl` is optional. If neither is supplied, the function attempts to bootstrap the session from the configured login page and extract the challenge from the response URL or redirect.

## Response shape

```json
{
  "success": true,
  "loginChallenge": "...",
  "encryptedPasswordPreview": "abc123...xyz789",
  "cookies": {
    "SESSION": "..."
  },
  "cookieHeader": "SESSION=...",
  "loginStatus": 200,
  "redirectLocation": null,
  "responsePreview": "...",
  "swipeRequest": {
    "greythrUserId": "123456",
    "startDate": "2026-04-01",
    "url": "https://wortgage.greythr.com/latte/v3/attendance/info/123456/swipes?..."
  },
  "swipeResponse": {}
}
```

`cookieHeader` is the string to reuse when calling authenticated greytHR attendance endpoints.
If `greythrUserId` is omitted, Step 6 is skipped and `swipeRequest` / `swipeResponse` are absent.

## Environment variables

- `GREYTHR_LOGIN_PAGE_URL`
- `GREYTHR_LOGIN_API_URL`
- `GREYTHR_JWKS_URL`
- `GREYTHR_SWIPES_URL_BASE`
- `GREYTHR_ORIGIN`
- `GREYTHR_USER_AGENT`
- `GREYTHR_RSA_PADDING`
  - `pkcs1` default
  - `oaep` if greytHR changes to RSA-OAEP
- `GREYTHR_RSA_OAEP_HASH`
  - defaults to `sha256`

## Notes

- This implementation uses the built-in Node compatibility layer available in Supabase Edge Functions for RSA encryption.
- The function logs each step and trims large payloads to keep debugging manageable.
- Do not persist plaintext passwords in logs. Feed the password from Supabase Vault or your encrypted credential store at invocation time.
