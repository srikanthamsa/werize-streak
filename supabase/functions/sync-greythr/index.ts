import { Buffer } from "node:buffer";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type LoginRequest = {
  userName: string;
  password: string;
  greythrUserId?: string;
  loginChallenge?: string;
  refererUrl?: string;
  dryRun?: boolean;
};

type SessionConfig = {
  accessId?: string;
  oidcConfig?: {
    hydraUrl?: string;
  };
};

type BootstrapContext = {
  loginChallenge: string;
  authorizeUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
};

type LoginResult = {
  success: boolean;
  loginChallenge: string;
  encryptedPasswordPreview: string;
  cookies: Record<string, string>;
  cookieHeader: string;
  loginStatus: number;
  redirectLocation: string | null;
  responsePreview: string;
  swipeRequest?: {
    greythrUserId: string;
    startDate: string;
    url: string;
  };
  swipeResponse?: unknown;
  discoveredUserId?: string;
};

const SESSION_CONFIG_URL = Deno.env.get("GREYTHR_SESSION_CONFIG_URL") ??
  "https://wortgage.greythr.com/uas/v1/session-config";
const AUTH_BOOTSTRAP_URL_PATH = "/oauth2/auth";
const LOGIN_API_URL = Deno.env.get("GREYTHR_LOGIN_API_URL") ??
  "https://wortgage.greythr.com/uas/v1/login";
const THEME_URL = Deno.env.get("GREYTHR_THEME_URL") ??
  "https://wortgage.greythr.com/uas/v1/theme";
const SWIPES_URL_BASE = Deno.env.get("GREYTHR_SWIPES_URL_BASE") ??
  "https://wortgage.greythr.com/latte/v3/attendance/info";
const DEFAULT_HYDRA_URL = Deno.env.get("GREYTHR_HYDRA_URL") ?? "https://goth-coral.greythr.com";
const OAUTH_CLIENT_ID = Deno.env.get("GREYTHR_OAUTH_CLIENT_ID") ?? "greythr-coral";
const OAUTH_REDIRECT_URI = Deno.env.get("GREYTHR_OAUTH_REDIRECT_URI") ??
  "https://idp-coral.greythr.com/uas/portal/auth/callback";
const ORIGIN = Deno.env.get("GREYTHR_ORIGIN") ?? "https://wortgage.greythr.com";
const USER_AGENT = Deno.env.get("GREYTHR_USER_AGENT") ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

// Hardcoded password-encryption public key extracted from GreytHR's JS bundle (lde_publicKey).
// GreytHR encrypts passwords with RSA-OAEP + SHA-256 using this key, distinct from the OAuth JWKS key.
const LDE_PUBLIC_KEY_PEM = Deno.env.get("GREYTHR_LDE_PUBLIC_KEY") ??
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoLf7n9YvJsoinXlx6hNS\nqcwLZVKR1VoMgrvYPPyfk0c5OmgUoECdxsSwr7fY58BDnAJL/t4xSWjlP8wccPRH\nL6R6wXJhBc4/9S7jows/Bc5TqDOdP7TRwhmmHzgBJLabNuDvS5H77iGNjnoob3AW\ns/a1dTG0Ztf2p7TUCG2leHW6UckUTvYhGpO9W7WO1rqBpdPlfN7fhhbkNermzfe0\ndJSQdTaztAmLco8QCKhKwvMvMXNfF53sAOOkNGBkF/R7TIHtu9slfVy+gJbBYwAr\nvmEyoYitD76f7v73YRlMGJcVj+9aWCSQ0Mpdc39wmiH9z9WQdC9TsVVc0TOcF3Ov\nFQIDAQAB\n-----END PUBLIC KEY-----";

class CookieJar {
  #cookies = new Map<string, string>();

  absorb(headers: Headers) {
    const setCookieValues = getSetCookieHeaders(headers);
    for (const entry of setCookieValues) {
      const [nameValue] = entry.split(";");
      const splitIndex = nameValue.indexOf("=");
      if (splitIndex <= 0) {
        continue;
      }

      const name = nameValue.slice(0, splitIndex).trim();
      const value = nameValue.slice(splitIndex + 1).trim();
      if (!name || !value) {
        continue;
      }

      this.#cookies.set(name, value);
    }
  }

  toHeader() {
    return [...this.#cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  toObject() {
    return Object.fromEntries(this.#cookies.entries());
  }
}

function getSetCookieHeaders(headers: Headers) {
  const accessor = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof accessor.getSetCookie === "function") {
    return accessor.getSetCookie();
  }

  const legacy = headers.get("set-cookie");
  if (!legacy) {
    return [];
  }

  return splitSetCookieHeader(legacy);
}

function splitSetCookieHeader(header: string) {
  const result: string[] = [];
  let current = "";
  let inExpires = false;

  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    const nextSlice = header.slice(index, index + 8).toLowerCase();

    if (nextSlice === "expires=") {
      inExpires = true;
    }

    if (char === ",") {
      if (inExpires) {
        current += char;
        continue;
      }

      result.push(current.trim());
      current = "";
      continue;
    }

    if (char === ";") {
      inExpires = false;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function extractLoginChallenge(input?: string) {
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    return url.searchParams.get("login_challenge");
  } catch {
    return input;
  }
}

function buildBrowserHeaders(extra: HeadersInit = {}) {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: ORIGIN,
    Referer: `${ORIGIN}/`,
    "User-Agent": USER_AGENT,
    ...extra,
  };
}

function mask(value: string, keep = 6) {
  if (value.length <= keep * 2) {
    return value;
  }

  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function previewResponseBody(body: string) {
  return body.length > 700 ? `${body.slice(0, 700)}...` : body;
}

function getSyncStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 45);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}



function toBase64Url(bytes: Uint8Array) {
  const base64 = Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(digest));
}

async function fetchSessionConfig(cookieJar: CookieJar) {
  console.log("[step1] fetching session config");
  const response = await fetch(SESSION_CONFIG_URL, {
    method: "GET",
    headers: buildBrowserHeaders({
      Accept: "application/json, text/plain, */*",
    }),
    redirect: "manual",
  });

  cookieJar.absorb(response.headers);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `[step1] session-config failed (${response.status}): ${previewResponseBody(body)}`,
    );
  }

  let payload: SessionConfig;
  try {
    payload = JSON.parse(body) as SessionConfig;
  } catch {
    throw new Error(`[step1] session-config was not valid JSON: ${previewResponseBody(body)}`);
  }

  if (!payload.accessId) {
    throw new Error(`[step1] session-config missing accessId: ${previewResponseBody(body)}`);
  }

  return {
    accessId: payload.accessId,
    hydraUrl: payload.oidcConfig?.hydraUrl ?? DEFAULT_HYDRA_URL,
  };
}

async function fetchLoginChallenge(
  cookieJar: CookieJar,
  providedChallenge?: string,
  refererUrl?: string,
): Promise<BootstrapContext> {
  console.log("[step1] starting OIDC bootstrap");

  const challenge = extractLoginChallenge(providedChallenge) ?? extractLoginChallenge(refererUrl);
  if (challenge) {
    console.log(`[step1] using provided challenge ${mask(challenge)}`);
    return {
      loginChallenge: challenge,
      authorizeUrl: "",
      state: "",
      nonce: "",
      codeVerifier: "",
      codeChallenge: "",
    };
  }

  const { accessId, hydraUrl } = await fetchSessionConfig(cookieJar);
  const state = randomBase64Url(24);
  const nonce = randomBase64Url(24);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const url = new URL("/oauth2/auth", hydraUrl);
  url.searchParams.set("client_id", OAUTH_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid offline");
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  url.searchParams.set("access_id", accessId);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  console.log(`[step1] GET authorize ${url.toString()}`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...buildBrowserHeaders(),
      Cookie: cookieJar.toHeader(),
    },
    redirect: "manual",
  });

  cookieJar.absorb(response.headers);
  const location = response.headers.get("location");
  console.log(
    `[step1] authorize status=${response.status} location=${location ? mask(location, 20) : "none"}`,
  );

  const resolvedChallenge = extractLoginChallenge(location ?? undefined) ??
    extractLoginChallenge(response.url);

  if (!resolvedChallenge) {
    const body = await response.text();
    throw new Error(
      `[step1] login_challenge missing after authorize redirect. Response status: ${response.status}. Preview: ${previewResponseBody(body)}`,
    );
  }

  console.log(`[step1] resolved challenge ${mask(resolvedChallenge)}`);
  return {
    loginChallenge: resolvedChallenge,
    authorizeUrl: url.toString(),
    state,
    nonce,
    codeVerifier,
    codeChallenge,
  };
}

async function encryptPassword(password: string) {
  console.log("[step3] encrypting with WebCrypto RSA-OAEP SHA-256 using lde_publicKey");
  // Strip PEM headers/footers and whitespace to get raw base64 DER
  const pemBody = LDE_PUBLIC_KEY_PEM
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const derBytes = Buffer.from(pemBody, "base64");
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    derBytes,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cryptoKey,
    new TextEncoder().encode(password),
  );
  const encoded = Buffer.from(encrypted).toString("base64");
  console.log(`[step3] encrypted size=${encoded.length}`);
  return encoded;
}

async function executeLogin(
  cookieJar: CookieJar,
  userName: string,
  encryptedPassword: string,
  loginChallenge: string,
) {
  console.log("[step4] executing login POST");

  const response = await fetch(LOGIN_API_URL, {
    method: "POST",
    headers: {
      ...buildBrowserHeaders({
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Cookie: cookieJar.toHeader(),
        "x-oauth-challenge": loginChallenge,
      }),
    },
    body: JSON.stringify({
      userName,
      password: encryptedPassword,
    }),
    redirect: "manual",
  });

  cookieJar.absorb(response.headers);
  const responseText = await response.text();
  console.log(`[step4] status=${response.status} redirect=${response.headers.get("location") ?? "none"}`);

  let responseJson: Record<string, unknown> | null = null;
  try {
    responseJson = JSON.parse(responseText) as Record<string, unknown>;
    console.log(`[step4] response keys=${Object.keys(responseJson).join(",")}`);
  } catch {
    console.log("[step4] response was not JSON");
  }

  return {
    response,
    responseText,
    responseJson,
  };
}

async function resumeAuthorizeFlow(cookieJar: CookieJar, authorizeUrl: string) {
  if (!authorizeUrl) {
    console.log("[step5] authorize replay skipped because bootstrap authorizeUrl is unavailable");
    return null;
  }

  console.log(`[step5] replaying authorize URL ${authorizeUrl}`);
  const response = await fetch(authorizeUrl, {
    method: "GET",
    headers: {
      ...buildBrowserHeaders(),
      Cookie: cookieJar.toHeader(),
    },
    redirect: "manual",
  });

  cookieJar.absorb(response.headers);
  console.log(
    `[step5] authorize replay status=${response.status} location=${response.headers.get("location") ?? "none"}`,
  );

  return response;
}

async function followRedirectLocation(cookieJar: CookieJar, redirectLocation: string, maxHops = 8) {
  console.log(`[step5] following redirect_location ${mask(redirectLocation, 40)}`);
  const bootstrapResponse = new Response(null, {
    status: 302,
    headers: new Headers({
      location: redirectLocation,
    }),
  });

  return followAuthenticatedRedirects(cookieJar, bootstrapResponse, maxHops);
}

async function followAuthenticatedRedirects(
  cookieJar: CookieJar,
  initialResponse: Response | null,
  maxHops = 8,
) {
  console.log("[step5] establishing authenticated session via redirect chain");

  let nextLocation = initialResponse?.headers.get("location") ?? null;
  let hop = 0;
  const hops: string[] = [];
  let finalUrl: string | null = null;
  let callbackUrl: string | null = null;

  while (nextLocation && hop < maxHops) {
    hop += 1;
    const resolvedUrl = new URL(nextLocation, ORIGIN).toString();
    const resolvedParams = new URL(resolvedUrl).searchParams;
    if (!callbackUrl && resolvedParams.get("code")) {
      callbackUrl = resolvedUrl;
      console.log(`[step5] captured callback URL with auth code: ${mask(resolvedUrl, 40)}`);
    }

    console.log(`[step5] hop=${hop} GET ${resolvedUrl}`);
    const response = await fetch(resolvedUrl, {
      method: "GET",
      headers: {
        ...buildBrowserHeaders({
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Cookie: cookieJar.toHeader(),
          Referer: resolvedUrl,
        }),
      },
      redirect: "manual",
    });

    cookieJar.absorb(response.headers);
    const nextLoc = response.headers.get("location");
    hops.push(`hop${hop}: GET ${mask(resolvedUrl, 40)} → ${response.status} → ${nextLoc ? mask(nextLoc, 40) : "final"}`);
    console.log(`[step5] hop=${hop} status=${response.status} location=${nextLoc ?? "none"}`);

    nextLocation = nextLoc;

    if (!nextLocation) {
      finalUrl = resolvedUrl;
      const bodyPreview = previewResponseBody(await response.text());
      console.log(`[step5] final response body preview: ${bodyPreview}`);
      break;
    }
  }

  if (hop >= maxHops && nextLocation) {
    console.log("[step5] redirect chain stopped at max hop count");
    hops.push("STOPPED: max hop count reached");
  }

  return { hops, finalUrl, callbackUrl };
}

async function bootstrapLatteSession(cookieJar: CookieJar, accessToken: string | null) {
  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  // Visit the period/current endpoint to seed the latte session
  const portalPage = `https://wortgage.greythr.com/v3/portal/ess/attendance/attendance-info`;
  const url = `https://wortgage.greythr.com/latte/v3/attendance/info/period/current`;
  console.log(`[step6] bootstrapping latte session: GET ${url} hasToken=${!!accessToken}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...buildBrowserHeaders({
        Accept: "application/json, text/plain, */*",
        Cookie: cookieJar.toHeader(),
        "X-Requested-With": "XMLHttpRequest",
        Referer: portalPage,
        ...authHeader,
      }),
    },
    redirect: "follow",
  });

  cookieJar.absorb(response.headers);
  await response.text(); // consume body
  console.log(`[step6] latte bootstrap status=${response.status}`);
}

async function fetchSwipeData(cookieJar: CookieJar, greythrUserId: string, accessToken: string | null) {
  await bootstrapLatteSession(cookieJar, accessToken);
  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const startDate = getSyncStartDate();
  const url = new URL(`${SWIPES_URL_BASE}/${encodeURIComponent(greythrUserId)}/swipes`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", "");
  url.searchParams.set("systemSwipes", "true");
  url.searchParams.set("swipePairs", "true");

  console.log(`[step6] GET ${url.toString()}`);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...buildBrowserHeaders({
        Accept: "application/json, text/plain, */*",
        Cookie: cookieJar.toHeader(),
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://wortgage.greythr.com/v3/portal/ess/attendance/attendance-info",
        ...authHeader,
      }),
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `[step6] swipe fetch failed (${response.status}): ${previewResponseBody(responseText)}`,
    );
  }

  let swipeResponse: unknown = responseText;
  try {
    swipeResponse = JSON.parse(responseText);
  } catch {
    console.log("[step6] response was not JSON; returning raw text preview");
  }

  return {
    startDate,
    url: url.toString(),
    swipeResponse,
  };
}

async function finalizePortalSession(cookieJar: CookieJar) {
  console.log("[step5] finalizing portal session via theme endpoint");

  const response = await fetch(THEME_URL, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      Cookie: cookieJar.toHeader(),
      Referer: ORIGIN,
    },
    redirect: "manual",
  });

  cookieJar.absorb(response.headers);
  const responseText = await response.text();
  console.log(
    `[step5] theme status=${response.status} location=${response.headers.get("location") ?? "none"} cookies=${Object.keys(cookieJar.toObject()).join(",")}`,
  );

  // 302 is acceptable — the session is established and the theme may redirect to the portal
  if (!response.ok && response.status !== 302) {
    throw new Error(
      `[step5] theme bootstrap failed (${response.status}): ${previewResponseBody(responseText)}`,
    );
  }

  return responseText;
}

async function discoverUserId(cookieJar: CookieJar, accessToken: string | null) {
  const url = "https://wortgage.greythr.com/uas/v1/user/profile";
  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  console.log(`[step5d] discovering userId from profile endpoint`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...buildBrowserHeaders({
        Accept: "application/json, text/plain, */*",
        Cookie: cookieJar.toHeader(),
        "X-Requested-With": "XMLHttpRequest",
        ...authHeader,
      }),
    },
  });

  if (response.ok) {
    try {
      const data = await response.json();
      if (data.userId) {
        console.log(`[step5d] discovered userId: ${data.userId}`);
        return String(data.userId);
      }
      throw new Error(`Profile JSON did not contain userId: ${JSON.stringify(data).slice(0, 500)}`);
    } catch (e: any) {
      console.log(`[step5d] profile parse error: ${e.message}`);
      throw new Error(`discoverUserId failed: ${e.message}`);
    }
  } else {
    throw new Error(`[step5d] profile fetch failed with status ${response.status}`);
  }
}

function buildSuccessResult(
  loginChallenge: string,
  encryptedPassword: string,
  cookieJar: CookieJar,
  loginStatus: number,
  redirectLocation: string | null,
  responsePreview: string,
  swipeRequest?: LoginResult["swipeRequest"],
  swipeResponse?: unknown,
  discoveredUserId?: string,
): LoginResult {
  return {
    success: loginStatus >= 200 && loginStatus < 400,
    loginChallenge,
    encryptedPasswordPreview: mask(encryptedPassword, 12),
    cookies: cookieJar.toObject(),
    cookieHeader: cookieJar.toHeader(),
    loginStatus,
    redirectLocation,
    responsePreview,
    swipeRequest,
    swipeResponse,
    discoveredUserId,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json(
      {
        error: "Method not allowed",
        hint:
          "Send a POST body with userName, password, and optionally greythrUserId, loginChallenge, or refererUrl.",
      },
      { status: 405 },
    );
  }

  const cookieJar = new CookieJar();

  try {
    const payload = await request.json() as LoginRequest;
    if (!payload.userName || !payload.password) {
      return Response.json(
        { error: "Missing required fields", required: ["userName", "password"] },
        { status: 400 },
      );
    }
    const bootstrapContext = await fetchLoginChallenge(
      cookieJar,
      payload.loginChallenge,
      payload.refererUrl,
    );
    const encryptedPassword = await encryptPassword(payload.password);

    if (payload.dryRun) {
      console.log("[step4] dryRun enabled, skipping login POST");
      return Response.json(
        buildSuccessResult(
          bootstrapContext.loginChallenge,
          encryptedPassword,
          cookieJar,
          0,
          null,
          "dryRun enabled; login POST skipped",
        ),
      );
    }

    const { response, responseText, responseJson } = await executeLogin(
      cookieJar,
      payload.userName,
      encryptedPassword,
      bootstrapContext.loginChallenge,
    );

    console.log(`[step4] loginStatus=${response.status}`);

    const redirectLocation = typeof responseJson?.redirect_location === "string"
      ? responseJson.redirect_location
      : typeof responseJson?.redirectUrl === "string"
      ? responseJson.redirectUrl
      : null;

    let finalCallbackUrl: string | null = null;

    if (redirectLocation) {
      const result = await followRedirectLocation(cookieJar, redirectLocation);
      finalCallbackUrl = result.callbackUrl ?? result.finalUrl;
    } else {
      const authorizeReplayResponse = await resumeAuthorizeFlow(
        cookieJar,
        bootstrapContext.authorizeUrl,
      );
      const result = await followAuthenticatedRedirects(cookieJar, authorizeReplayResponse);
      finalCallbackUrl = result.callbackUrl ?? result.finalUrl;
    }

    // The Angular K4 callback at idp-coral does a JS redirect back to wortgage with the code.
    // We must explicitly POST the code to wortgage's BFF token endpoint, which exchanges it
    // with Hydra (server-to-server) and sets the access_token cookie.
    let accessToken: string | null = null;
    if (finalCallbackUrl && bootstrapContext.codeVerifier) {
      const cbp = new URL(finalCallbackUrl);
      const code = cbp.searchParams.get("code");
      if (code) {
        console.log("[step5c] initiating token exchange with wortgage BFF");
        const tokenResponse = await fetch(`${ORIGIN}/uas/v1/initiate/token-request`, {
          method: "POST",
          headers: {
            ...buildBrowserHeaders({
              Accept: "application/json, text/plain, */*",
              "Content-Type": "application/json",
              Cookie: cookieJar.toHeader(),
              "CODE": code,
              "PKCE-verifier": bootstrapContext.codeVerifier,
              Referer: `${ORIGIN}/uas/portal/auth/redirect-callback`,
            }),
          },
          body: "{}",
        });
        cookieJar.absorb(tokenResponse.headers);
        const tokenBody = await tokenResponse.text();
        console.log(`[step5c] token exchange status=${tokenResponse.status}`);
        const cookieObj = cookieJar.toObject();
        if (cookieObj["access_token"]) {
          accessToken = cookieObj["access_token"];
        } else {
          try {
            const tokenJson = JSON.parse(tokenBody) as Record<string, unknown>;
            if (typeof tokenJson.access_token === "string") accessToken = tokenJson.access_token;
          } catch { /* not JSON */ }
        }
      }
    }

    await finalizePortalSession(cookieJar);

    let syncUserId = payload.greythrUserId;
    if (!syncUserId) {
      syncUserId = (await discoverUserId(cookieJar, accessToken)) ?? undefined;
    }

    let swipeRequest: LoginResult["swipeRequest"];
    let swipeResponse: unknown;

    if (syncUserId) {
      const swipeResult = await fetchSwipeData(cookieJar, syncUserId, accessToken);
      swipeRequest = {
        greythrUserId: syncUserId,
        startDate: swipeResult.startDate,
        url: swipeResult.url,
      };
      swipeResponse = swipeResult.swipeResponse;
      console.log("[step6] swipe data fetched successfully");
    } else {
      console.log("[step6] skipped because greythrUserId was neither provided nor discovered");
    }

    return Response.json(
      buildSuccessResult(
        bootstrapContext.loginChallenge,
        encryptedPassword,
        cookieJar,
        response.status,
        response.headers.get("location"),
        previewResponseBody(responseText),
        swipeRequest,
        swipeResponse,
        syncUserId,
      ),
      {
        status: response.ok ? 200 : 401,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[auth] handshake failed", error);

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});
