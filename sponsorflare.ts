declare global {
  var env: Env;
}

export type Usage = {
  totalAmount: number;
  date: string;
  hostname: string;
  count: number;
};

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_PAT: string;
  LOGIN_REDIRECT_URI: string;
  SPONSOR_DO: DurableObjectNamespace;
  /** If 'true', will skip login and use "GITHUB_PAT" for access */
  SKIP_LOGIN: string;
  COOKIE_DOMAIN_SHARING: string;
}

/** Datastructure of a github user - this is what's consistently stored in the SPONSOR_DO storage */
export type Sponsor = {
  /** whether or not the sponsor has ever authenticated anywhere */
  is_authenticated?: boolean;
  /** url where the user first authenticated */
  source?: string;
  /** node id of the user */
  owner_id: string;
  /** github username */
  owner_login: string;
  /** github avatar url */
  avatar_url?: string;
  blog?: string | null;
  bio?: string | null;
  email?: string | null;
  twitter_username?: string | null;

  /** true if the user has ever sponsored */
  is_sponsor?: boolean;
  /** total money the user has paid, in cents */
  clv?: number;
  /** total money spent on behalf of the user (if tracked), in cents */
  spent?: number;
  /** (clv-spent)/100 = balance (in usd) */
  balance?: number;

  /** Updated every time the user is verified through one of their access tokens */
  updatedAt?: number;
  createdAt?: number;
};

interface SponsorNode {
  hasSponsorsListing: boolean;
  isSponsoringViewer: boolean;
  login?: string;
  avatarUrl?: string;
  bio?: string;
  databaseId?: string;
}

interface SponsorshipValueNode {
  amountInCents: number;
  formattedAmount: string;
  sponsor: SponsorNode;
}

interface ViewerData {
  monthlyEstimatedSponsorsIncomeInCents: number;
  avatarUrl: string;
  login: string;
  sponsorCount: number;
  sponsors: {
    amountInCents: number;
    formattedAmount: string;
    hasSponsorsListing: boolean;
    isSponsoringViewer: boolean;
    login?: string;
    avatarUrl?: string;
    bio?: string;
    id?: string;
  }[];
}

interface Enterprise {}
interface Installation {}
interface Organization {}
interface Repository {}

interface User {
  login: string;
  id: number;
  node_id: string;
  [key: string]: any;
}

interface Maintainer {
  node_id: string;
  [key: string]: any;
}

interface Tier {
  created_at: string;
  description: string;
  is_custom_ammount?: boolean;
  is_custom_amount?: boolean;
  is_one_time: boolean;
  monthly_price_in_cents: number;
  monthly_price_in_dollars: number;
  name: string;
  node_id: string;
}

interface Sponsorship {
  created_at: string;
  maintainer: Maintainer;
  node_id: string;
  privacy_level: string;
  sponsor: User | null;
  sponsorable: User | null;
  tier: Tier;
}

interface SponsorEvent {
  changes?: any;
  enterprise?: Enterprise;
  installation?: Installation;
  organization?: Organization;
  repository?: Repository;
  sender: User;
  sponsorship: Sponsorship;
}
type CookieValue = {
  access_token: string;
  owner_id: number;
  scope: string;
};
function createCookieSafeToken(data: CookieValue) {
  // Base64Url encode
  const token = btoa(JSON.stringify(data))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Additional URL encoding for cookie safety
  return encodeURIComponent(token);
}

function parseCookieSafeToken(cookieValue: string): CookieValue | undefined {
  try {
    // Decode the URL encoding
    const token = decodeURIComponent(cookieValue);

    // Add padding if needed for base64 decoding
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4;
    const fullPadded = pad ? padded + "=".repeat(4 - pad) : padded;

    // Decode and parse
    return JSON.parse(atob(fullPadded));
  } catch (e) {
    // could not be parsed; invalid token
    return;
  }
}

const initializeUser = async (
  env: Env,
  access_token: string,
  source?: string,
  scope?: string,
) => {
  // Fetch user data (keep existing code)
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${access_token}`,
      "User-Agent": "Cloudflare-Workers",
    },
  });

  if (!userResponse.ok) {
    return { error: await userResponse.text(), status: userResponse.status };
  }
  const userData: {
    id: number;
    login: string;
    avatar_url: string;
    blog?: string;
    bio?: string;
    twitter_username?: string;
  } = await userResponse.json();

  let email: string | undefined = undefined;
  try {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "Cloudflare-Workers",
      },
    });

    if (emailsResponse.ok) {
      const emails: {
        primary: boolean;
        verified: boolean;
        visibility: "private" | null;
        email: string;
      }[] = await emailsResponse.json();
      const primaryEmail =
        emails.find((x) => x.primary && x.verified)?.email ||
        emails.find((x) => x.verified)?.email;
      email = primaryEmail;
    }
  } catch {}

  // Create sponsor object
  const sponsorData: Sponsor = {
    owner_id: userData.id.toString(),
    owner_login: userData.login,
    avatar_url: userData.avatar_url,
    blog: userData.blog,
    bio: userData.bio,
    twitter_username: userData.twitter_username,
    is_authenticated: true,
    email,
    source,
    updatedAt: Date.now(),
  };

  // Get Durable Object instance
  const id = env.SPONSOR_DO.idFromName(userData.id.toString());
  const stub = env.SPONSOR_DO.get(id);

  // Initialize the Durable Object with sponsor data and access token
  const initResponse = await stub.fetch(
    new Request("http://fake-host/initialize", {
      method: "POST",
      body: JSON.stringify({
        sponsor: sponsorData,
        access_token,
        scope,
        source,
      }),
    }),
  );

  if (!initResponse.ok) {
    return { error: await initResponse.text(), status: initResponse.status };
  }

  return {
    status: 200,
    userData,
    sponsorData,
    owner_id: userData.id.toString(),
  };
};

export { stats } from "./stats";
export class SponsorDO {
  private state: DurableObjectState;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // Handle different operations based on the path
    switch (url.pathname) {
      case "/initialize":
        const initData: {
          sponsor: Sponsor;
          access_token: string;
          scope: string;
          source: string;
        } = await request.json();

        const already: Sponsor | undefined = await this.storage.get("sponsor", {
          noCache: true,
        });

        await this.storage.put(
          "sponsor",
          {
            ...(already || { createdAt: Date.now() }),
            ...initData.sponsor,
          },
          { noCache: true, allowUnconfirmed: false },
        );

        if (initData.access_token) {
          await this.storage.put(initData.access_token, {
            scope: initData.scope,
            createdAt: Date.now(),
            source: initData.source,
          });
        }

        return new Response("Initialized", { status: 200 });

      case "/user": {
        const sponsor: Sponsor | undefined = await this.storage.get("sponsor");
        if (!sponsor) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(JSON.stringify(sponsor), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      case "/verify":
        // Endpoint used to check if a user uses a token
        const access_token = url.searchParams.get("token");

        const tokenData:
          | { scope: string; source: string; createdAt: number }
          | undefined = await this.storage.get(access_token!);

        if (!tokenData) {
          return new Response("Invalid token", { status: 401 });
        }

        const sponsor: Sponsor | undefined = await this.storage.get("sponsor");

        if (sponsor) {
          await this.storage.put("sponsor", {
            ...sponsor,
            updatedAt: Date.now(),
          } satisfies Sponsor);
        }

        return new Response(JSON.stringify(sponsor), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "/usage":
        const charges = await this.storage.list({
          prefix: "charge.",
          allowConcurrency: true,
        });

        const entries = Array.from(charges.values()) as {
          amount: number;
          timestamp: number;
          source: string;
        }[];

        // Group by YYYY-MM-DD and hostname
        const grouped = entries.reduce(
          (acc, entry) => {
            // Convert timestamp to YYYY-MM-DD
            const date = new Date(entry.timestamp).toISOString().split("T")[0];

            // Extract hostname from URL
            const url = entry.source ? new URL(entry.source) : undefined;
            const hostname = url?.hostname || null;

            // Create unique key for date + hostname
            const key = `${date}|${hostname || "null"}`;

            if (!acc[key]) {
              acc[key] = {
                date,
                hostname,
                totalAmount: 0,
                count: 0,
              };
            }

            acc[key].totalAmount += entry.amount;
            acc[key].count += 1;

            return acc;
          },
          {} as Record<
            string,
            {
              date: string;
              hostname: string | null;
              totalAmount: number;
              count: number;
            }
          >,
        );

        // Convert to array and sort by date desc, then hostname
        const result = Object.values(grouped)
          .sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return (a.hostname || "null").localeCompare(b.hostname || "null");
          })
          .map((group) => ({
            ...group,
            totalAmount: group.totalAmount / 100, // Convert cents to dollars
          }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));

        return new Response(JSON.stringify(result));

      case "/set-credit": {
        const newClv = Number(url.searchParams.get("clv"));

        if (isNaN(newClv)) {
          return new Response("Invalid userId or clv", { status: 400 });
        }

        const sponsor_data: Sponsor | undefined = await this.storage.get(
          "sponsor",
        );

        if (!sponsor_data) {
          return new Response("Sponsor not found", { status: 404 });
        }

        const updated = {
          ...sponsor_data,
          clv: newClv,
        };

        await this.storage.put("sponsor", updated);

        return new Response(JSON.stringify(updated));
      }

      case "/charge": {
        const chargeAmount = Number(url.searchParams.get("amount"));
        const source = url.searchParams.get("source");
        const idempotencyKey = url.searchParams.get("idempotency_key");

        if (!idempotencyKey) {
          return new Response("Idempotency key required", { status: 400 });
        }

        const chargeKey = `charge.${idempotencyKey}`;
        const existingCharge = await this.storage.get(chargeKey);

        if (existingCharge) {
          return new Response(
            JSON.stringify({
              message: "Charge already processed",
              charge: existingCharge,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const sponsor_data: Sponsor | undefined = await this.storage.get(
          "sponsor",
        );

        if (!sponsor_data) {
          return new Response("Sponsor not found", { status: 404 });
        }

        const updated = {
          ...sponsor_data,
          spent: (sponsor_data.spent || 0) + chargeAmount,
        };

        await this.storage.put("sponsor", updated);

        // Record the charge with timestamp
        await this.storage.put(chargeKey, {
          amount: chargeAmount,
          timestamp: Date.now(),
          source,
        });

        return new Response(JSON.stringify(updated), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  }
}

export const setCredit = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const apiKey = url.searchParams.get("apiKey");
  const clv = Number(url.searchParams.get("clv"));

  if (!userId || isNaN(clv)) {
    return new Response("Invalid userId or clv", { status: 400 });
  }

  if (!apiKey || apiKey !== env.GITHUB_PAT) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = env.SPONSOR_DO.idFromName(userId);
  const stub = env.SPONSOR_DO.get(id);

  const response = await stub.fetch(`http://fake-host/set-credit?clv=${clv}`);

  if (!response.ok) {
    return new Response("Failed to set credit", { status: 500 });
  }

  return response;
};

export async function fetchAllSponsorshipData(
  accessToken: string,
): Promise<ViewerData> {
  if (!accessToken) {
    throw new Error("No Access Token");
  }
  const endpoint = "https://api.github.com/graphql";
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "CloudflareWorker",
  };

  let afterCursor: string | null = null;
  let hasNextPage = false;
  let totalCount = 0;
  const allNodes: SponsorshipValueNode[] = [];
  let monthlyIncome = 0;
  let avatarUrl = "";
  let login = "";

  do {
    const query = `
        query ($first: Int, $after: String) {
          viewer {
            monthlyEstimatedSponsorsIncomeInCents
            lifetimeReceivedSponsorshipValues(first: $first, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                amountInCents
                formattedAmount
                sponsor {
                  ... on User {
                    login
                    avatarUrl
                    bio
                    databaseId
                  }
                  hasSponsorsListing
                  isSponsoringViewer
                }
              }
            }
            avatarUrl
            login
          }
        }
      `;

    const variables = {
      first: 100,
      after: afterCursor,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${text}`);
    }

    const result: any = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const viewer = result.data?.viewer;
    if (!viewer) {
      throw new Error("No viewer data found");
    }

    const sponsorshipValues = viewer.lifetimeReceivedSponsorshipValues;

    // Capture metadata from first response
    if (totalCount === 0) {
      totalCount = sponsorshipValues.totalCount;
      monthlyIncome = viewer.monthlyEstimatedSponsorsIncomeInCents;
      avatarUrl = viewer.avatarUrl;
      login = viewer.login;
    }

    allNodes.push(...sponsorshipValues.nodes);
    hasNextPage = sponsorshipValues.pageInfo.hasNextPage;
    afterCursor = sponsorshipValues.pageInfo.endCursor || null;
  } while (hasNextPage);

  const sponsors = allNodes.map(
    ({ sponsor: { databaseId, ...user }, ...rest }) => {
      return { id: databaseId, ...rest, ...user };
    },
  );
  return {
    monthlyEstimatedSponsorsIncomeInCents: monthlyIncome,
    avatarUrl,
    login,
    sponsorCount: totalCount,
    sponsors,
  };
}

//its working!
// fetchAllSponsorshipData("").then(
//   (res) => console.dir(res, { depth: 999 }),
// );

export const html = (strings: TemplateStringsArray, ...values: any[]) => {
  return strings.reduce(
    (result, str, i) => result + str + (values[i] || ""),
    "",
  );
};

async function verifySignature(secret: string, header: string, payload: any) {
  let encoder = new TextEncoder();
  let parts = header.split("=");
  let sigHex = parts[1];

  let algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

  let keyBytes = encoder.encode(secret);
  let extractable = false;
  let key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    algorithm,
    extractable,
    ["sign", "verify"],
  );

  let sigBytes = hexToBytes(sigHex);
  let dataBytes = encoder.encode(payload);
  let equal = await crypto.subtle.verify(
    algorithm.name,
    key,
    sigBytes,
    dataBytes,
  );

  return equal;
}

function hexToBytes(hex: string) {
  let len = hex.length / 2;
  let bytes = new Uint8Array(len);

  let index = 0;
  for (let i = 0; i < hex.length; i += 2) {
    let c = hex.slice(i, i + 2);
    let b = parseInt(c, 16);
    bytes[index] = b;
    index += 1;
  }

  return bytes;
}

// Helper function to generate a random string
async function generateRandomString(length: number): Promise<string> {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const callbackGetAccessToken = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (env.SKIP_LOGIN === "true") {
    return { access_token: env.GITHUB_PAT, scope: "repo user" };
  }

  // Get the state from URL and cookies
  const urlState = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie");
  const rows = cookie?.split(";").map((x) => x.trim());

  const stateCookie = rows
    ?.find((row) => row.startsWith("github_oauth_state"))
    ?.split("=")[1]
    .trim();

  const redirectUriCookieRaw = rows
    ?.find((row) => row.startsWith("redirect_uri"))
    ?.split("=")[1]
    .trim();
  const redirectUriCookie = redirectUriCookieRaw
    ? decodeURIComponent(redirectUriCookieRaw)
    : undefined;

  if (!urlState || !stateCookie || urlState !== stateCookie) {
    return { error: `Invalid state`, status: 400 };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return { error: "Missing code", status: 400 };
  }

  // Exchange code for token (keep existing code)
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: code,
      }),
    },
  );

  if (!tokenResponse.ok) throw new Error();

  const { access_token, scope }: any = await tokenResponse.json();
  return { access_token, scope, redirectUriCookie };
};

export const middleware = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  // will be localhost for localhost, and uithub.com for cf.uithub.com. Ensures cookie is accepted across all subdomains
  const domain = url.hostname
    .split(".")
    .reverse()
    .slice(0, 2)
    .reverse()
    .join(".");

  // Login page route

  if (url.pathname === "/logout") {
    const redirect_uri = url.searchParams.get("redirect_uri");
    const skipLogin = env.SKIP_LOGIN === "true";
    const securePart = skipLogin ? "" : " Secure;";
    const domainPart =
      env.COOKIE_DOMAIN_SHARING === "true" && !skipLogin
        ? ` Domain=${domain};`
        : "";

    const headers = new Headers({ Location: redirect_uri || "/" });
    headers.append(
      "Set-Cookie",
      `authorization=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`,
    );

    return new Response("Redirecting", { status: 302, headers });
  }

  if (url.pathname === "/github-webhook" && request.method === "POST") {
    try {
      const event = request.headers.get("X-GitHub-Event") as string | null;
      console.log("ENTERED GITHUB WEBHOOK", event);
      const secret = env.GITHUB_WEBHOOK_SECRET;

      if (!secret) {
        return new Response("No GITHUB_WEBHOOK_SECRET found", {
          status: 401,
        });
      }

      if (!event) {
        console.log("Event not allowed:" + event);
        return new Response("Event not allowed:" + event, {
          status: 405,
        });
      }

      const payload = await request.text();
      const json: SponsorEvent = JSON.parse(payload);
      console.log({ payloadSize: payload.length });
      const signature256 = request.headers.get("X-Hub-Signature-256");
      console.log({ signature256 });

      if (!signature256 || !json) {
        return new Response("No signature or JSON", {
          status: 404,
        });
      }

      const isValid = await verifySignature(secret, signature256, payload);
      console.log({ isValid });

      if (!isValid) {
        return new Response("Invalid Signature", {
          status: 400,
        });
      }

      const sponsorshipData = await fetchAllSponsorshipData(env.GITHUB_PAT);
      console.log({ sponsorshipData });
      // Create promises array for all updates
      const updatePromises = [];

      // Update active sponsors
      for (const sponsor of sponsorshipData.sponsors) {
        if (!sponsor.id) continue;

        const id = env.SPONSOR_DO.idFromName(sponsor.id);
        const stub = env.SPONSOR_DO.get(id);

        // Prepare sponsor data
        const sponsorData: Sponsor = {
          owner_id: sponsor.id,
          owner_login: sponsor.login!,
          avatar_url: sponsor.avatarUrl,
          is_sponsor: true,
          clv: sponsor.amountInCents,
          updatedAt: Date.now(),
        };

        // Add update promise to array
        updatePromises.push(
          stub.fetch(
            new Request("http://fake-host/initialize", {
              method: "POST",
              body: JSON.stringify({
                sponsor: sponsorData,
                // We don't have access to individual access tokens here,
                // so we'll only update the sponsor data
                access_token: null,
              }),
            }),
          ),
        );
      }

      // Wait for all updates to complete
      await Promise.all(updatePromises);

      return new Response("Received event", {
        status: 200,
      });
    } catch (e: any) {
      console.log({ e });
      return new Response("=== Error In Webhook ===\n" + e.message, {
        status: 500,
      });
    }
  }

  if (url.pathname === "/login") {
    const scope = url.searchParams.get("scope");
    if (env.SKIP_LOGIN === "true") {
      return new Response("Redirecting", {
        status: 302,
        headers: { Location: url.origin + "/callback" },
      });
    }

    const state = await generateRandomString(16);
    if (
      !env.GITHUB_CLIENT_ID ||
      !env.GITHUB_REDIRECT_URI ||
      !env.GITHUB_CLIENT_SECRET
    ) {
      return new Response("Environment variables are missing");
    }

    const headers = new Headers({
      Location: `https://github.com/login/oauth/authorize?client_id=${
        env.GITHUB_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(env.GITHUB_REDIRECT_URI)}&scope=${
        scope || "user:email"
      }&state=${state}`,
    });

    const redirect_uri =
      url.searchParams.get("redirect_uri") || env.LOGIN_REDIRECT_URI;

    const domainPart =
      env.COOKIE_DOMAIN_SHARING === "true" ? ` Domain=${domain};` : "";
    headers.append(
      "Set-Cookie",
      `github_oauth_state=${state};${domainPart} HttpOnly; Path=/; Secure; SameSite=Lax; Max-Age=600`,
    );
    headers.append(
      "Set-Cookie",
      `redirect_uri=${encodeURIComponent(
        redirect_uri,
      )};${domainPart} HttpOnly; Path=/; Secure; SameSite=Lax; Max-Age=600`,
    );

    // Create a response with HTTP-only state cookie
    return new Response("Redirecting", { status: 302, headers });
  }

  // GitHub OAuth callback route
  if (url.pathname === "/callback") {
    try {
      const { error, status, access_token, scope, redirectUriCookie } =
        await callbackGetAccessToken(request, env);
      if (error || !access_token) {
        return new Response(error || "Something went wrong: " + status, {
          status,
        });
      }

      const initialized = await initializeUser(
        env,
        access_token,
        redirectUriCookie,
        scope,
      );

      if (initialized.error || !initialized.userData) {
        return new Response(initialized.error, {
          status: initialized.status,
        });
      }

      const { sponsorData, userData } = initialized;

      // Create response with cookies
      const headers = new Headers({
        Location: redirectUriCookie || env.LOGIN_REDIRECT_URI || "/",
      });

      const skipLogin = env.SKIP_LOGIN === "true";
      // on localhost, no 'secure' because we use http
      const securePart = skipLogin ? "" : " Secure;";
      const domainPart =
        env.COOKIE_DOMAIN_SHARING === "true" && !skipLogin
          ? ` Domain=${domain};`
          : "";
      const cookieSuffix = `;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=34560000; SameSite=Lax`;

      const bearerToken = createCookieSafeToken({
        access_token,
        owner_id: userData.id,
        scope,
      });

      headers.append(
        "Set-Cookie",
        `authorization=Bearer%20${bearerToken}${cookieSuffix}`,
      );

      headers.append(
        "Set-Cookie",
        `github_oauth_state=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`,
      );

      headers.append(
        "Set-Cookie",
        `redirect_uri=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`,
      );

      return new Response(`Redirecting to ${headers.get("location")}`, {
        status: skipLogin ? 200 : 302,
        headers,
      });
    } catch (error: any) {
      // Error handling
      console.error("ERROR", error);
      return new Response(
        html`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <title>Login Failed</title>
            </head>
            <body>
              <h1>Login Failed</h1>
              <p>Unable to complete authentication.</p>
              <p>${error.message}</p>
            </body>
          </html>
        `,
        {
          status: 500,
          headers: {
            "Content-Type": "text/html",
            // Clear the state cookie in case of error
            "Set-Cookie": `github_oauth_state=; HttpOnly; Path=/; Secure; Max-Age=0`,
          },
        },
      );
    }
  }
};

// Update the getSponsor function
export const getSponsor = async (
  request: Request,
  env: Env,
  config?: {
    /** amount to charge in cents */
    charge: number;
    /** if true, total spent amount may surpass clv */
    allowNegativeClv?: boolean;
  },
): Promise<
  {
    /** if true, it means the charge was added to 'spent' */
    charged: boolean;
    access_token?: string | null;
    owner_id?: string | null;
    scope?: string | null;
  } & Partial<Sponsor>
> => {
  const { owner_id, access_token, scope } = getAuthorization(request);
  if (!owner_id || !access_token) {
    return {
      is_authenticated: false,
      charged: false,
      access_token,
      scope,
    };
  }
  let ownerIdString = String(owner_id);

  try {
    // Get Durable Object instance
    const id = env.SPONSOR_DO.idFromName(ownerIdString);
    let stub = env.SPONSOR_DO.get(id);

    // Verify access token and get sponsor data
    const verifyResponse = await stub.fetch(
      `http://fake-host/verify?token=${encodeURIComponent(access_token)}`,
    );

    let sponsorData: Sponsor;
    if (verifyResponse.ok) {
      sponsorData = await verifyResponse.json();
    } else {
      const initialized = await initializeUser(
        env,
        access_token,
        request.url,
        scope || undefined,
      );

      if (
        !initialized.userData ||
        initialized.error ||
        !initialized.sponsorData
      ) {
        return {
          is_authenticated: false,
          charged: false,
          access_token,
          scope,
        };
      }

      // this is the verified owner_id from the access_token from the API
      if (initialized.owner_id !== ownerIdString) {
        ownerIdString = initialized.owner_id;
        const id = env.SPONSOR_DO.idFromName(ownerIdString);
        //owerwrite stub to prevent corrupt data
        stub = env.SPONSOR_DO.get(id);
      }

      sponsorData = initialized.sponsorData;
    }

    // now we have sponsordata, even if this access token wasn't in the db yet.

    // Handle charging if required
    let charged = false;
    const balanceCents = (sponsorData.clv || 0) - (sponsorData.spent || 0);
    const balance = balanceCents / 100;
    if (config?.charge) {
      if (!config.allowNegativeClv && balanceCents < config.charge) {
        return {
          is_authenticated: true,
          ...sponsorData,
          balance,
          charged: false,
          access_token,
          scope,
        };
      }
      const idempotencyKey = await generateRandomString(16);
      const chargeResponse = await stub.fetch(
        `http://fake-host/charge?amount=${
          config.charge
        }&idempotency_key=${idempotencyKey}&source=${encodeURIComponent(
          request.url,
        )}`,
      );

      if (chargeResponse.ok) {
        charged = true;
        const updatedData: Sponsor = await chargeResponse.json();
        const balanceCents = (updatedData.clv || 0) - (updatedData.spent || 0);
        const balance = balanceCents / 100;

        return {
          is_authenticated: true,
          access_token,
          scope,
          ...updatedData,
          balance,
          charged,
        };
      }
    }

    return {
      is_authenticated: true,
      ...sponsorData,
      access_token,
      scope,
      balance,
      charged,
    };
  } catch (error) {
    console.error("Sponsor lookup failed:", error);
    return { is_authenticated: false, charged: false };
  }
};

/**
 * Parses authorization details from the cookie, header, or query
 */
export const getAuthorization = (request: Request) => {
  // Get owner_id and authorization from cookies
  const cookie = request.headers.get("Cookie");
  const rows = cookie?.split(";").map((x) => x.trim());

  const authCookie = rows?.find((row) => row.startsWith("authorization="));

  // query, cookie, or header
  const authorization =
    new URL(request.url).searchParams.get("apiKey") ||
    authCookie?.split("=Bearer%20")[1].trim() ||
    request.headers.get("authorization")?.slice("Bearer ".length);

  if (!authorization) {
    return {};
  }

  const parse = parseCookieSafeToken(authorization);
  if (!parse) {
    return {};
  }

  const { access_token, scope, owner_id } = parse;

  return { scope, owner_id, access_token };
};

export const getUsage = async (request: Request, env: Env) => {
  const { owner_id, access_token } = getAuthorization(request);
  if (!owner_id || !access_token) {
    return { error: "No access" };
  }

  try {
    // Get Durable Object instance
    const id = env.SPONSOR_DO.idFromName(String(owner_id));
    const stub = env.SPONSOR_DO.get(id);

    // Verify access token and get sponsor data
    const verifyResponse = await stub.fetch(`http://fake-host/usage`);

    if (!verifyResponse.ok) {
      return { error: "Failed to get usage" };
    }

    const usage: Usage[] = await verifyResponse.json();
    return { usage };
  } catch (e: any) {
    return { error: e.message };
  }
};

/** 
Example: This would be a layered DO that first verifies the owner exists, then goes to a different DO for the same owner where the request is executed.

This makes that DO an incredibly simple way to create monetised, user-authenticated workers

Usage:

```
export default {
  fetch: proxy("MY_USER_DO"),
};
```

Example: see `user-todo-example.ts`

*/
export const proxy =
  (DO_NAME: string) =>
  async (
    request: Request,
    env: Env & { [doName: string]: DurableObjectNamespace },
  ) => {
    const sponsorflare = await middleware(request, env);
    if (sponsorflare) return sponsorflare;

    const sponsorData = await getSponsor(request, env);
    if (!sponsorData.is_authenticated || !sponsorData.owner_id) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ensure we have the data available
    request.headers.set("sponsor", JSON.stringify(sponsorData));

    const response = await env[DO_NAME].get(
      env[DO_NAME].idFromName(sponsorData.owner_id),
    ).fetch(request);

    const charge = response.headers.get("X-Charge");

    if (charge && !isNaN(Number(charge))) {
      const { charged } = await getSponsor(request, env, {
        charge: Number(charge),
        allowNegativeClv: true,
      });
      console.log({ charged });
    }

    return response;
  };
