declare global {
  var env: Env;
}

interface SponsorNode {
  hasSponsorsListing: boolean;
  isSponsoringViewer: boolean;
  login?: string;
  avatarUrl?: string;
  bio?: string;
  id?: string;
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

export async function fetchAllSponsorshipData(
  accessToken: string,
): Promise<ViewerData> {
  const endpoint = "https://api.github.com/graphql";
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
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
                    id
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
      throw new Error(`HTTP error! status: ${response.status}`);
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

  return {
    monthlyEstimatedSponsorsIncomeInCents: monthlyIncome,
    avatarUrl,
    login,
    sponsorCount: totalCount,
    sponsors: allNodes.map(({ sponsor, ...rest }) => ({ ...rest, ...sponsor })),
  };
}

// its working!
// fetchAllSponsorshipData("").then(
//   (res) => console.dir(res, { depth: 999 }),
// );

export const html = (strings: TemplateStringsArray, ...values: any[]) => {
  return strings.reduce(
    (result, str, i) => result + str + (values[i] || ""),
    "",
  );
};

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_PAT: string;
  LOGIN_REDIRECT_URI: string;
  SPONSORFLARE: D1Database;
}

/** Datastructure of a github user - this is what's consistently stored in the SPONSORFLARE D1 database */
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
  /** true if the user has ever sponsored */
  is_sponsor?: boolean;
  /** total money the user has paid, in cents */
  clv?: number;
  /** total money spent on behalf of the user (if tracked), in cents */
  spent?: number;
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

// Helper function to generate a random string
async function generateRandomString(length: number): Promise<string> {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const middleware = async (request: Request, env: Env) => {
  const url = new URL(request.url);

  // Login page route

  if (url.searchParams.has("logout")) {
    return new Response("Redirecting...", {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie":
          "authorization=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, " +
          "github_oauth_scope=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      },
    });
  }

  if (url.pathname === "/github-webhook" && request.method === "POST") {
    const event = request.headers.get("X-GitHub-Event") as string | null;
    console.log("ENTERED GITHUB WEBHOOK", event);
    const secret = env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("No GITHUB_WEBHOOK_SECRET found", {
        status: 500,
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
        status: 400,
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

    // Prepare batch upsert statements
    const statements = sponsorshipData.sponsors.map((sponsor) => {
      return env.SPONSORFLARE.prepare(
        `INSERT INTO sponsors (
      owner_id, 
      owner_login, 
      avatar_url, 
      is_sponsor, 
      clv, 
      source
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      owner_login = excluded.owner_login,
      avatar_url = excluded.avatar_url,
      is_sponsor = excluded.is_sponsor,
      clv = excluded.clv`,
      ).bind(
        sponsor.id,
        sponsor.login,
        sponsor.avatarUrl,
        1,
        sponsor.amountInCents,
        "github", // source (only set on initial insert)
      );
    });

    // Execute all statements in a batch
    await env.SPONSORFLARE.batch(statements);
    const currentSponsorIds = sponsorshipData.sponsors
      .map((s) => s.id)
      .filter((id) => !!id)
      .map((x) => x!);

    //TODO: input this into the db:  env.SPONSORFLARE.prepare(``)
    if (currentSponsorIds.length > 0) {
      // Update existing records not in current list
      await env.SPONSORFLARE.prepare(
        `UPDATE sponsors
         SET is_sponsor = 0
         WHERE owner_id NOT IN (${currentSponsorIds.map(() => "?").join(",")})`,
      )
        .bind(...currentSponsorIds)
        .run();
    } else {
      // Handle case where there are no current sponsors
      await env.SPONSORFLARE.exec(`UPDATE sponsors SET is_sponsor = 0`);
    }

    return new Response("Received event", {
      status: 200,
    });
  }

  if (url.pathname === "/login") {
    const scope = url.searchParams.get("scope");
    const state = await generateRandomString(16);
    if (
      !env.GITHUB_CLIENT_ID ||
      !env.GITHUB_REDIRECT_URI ||
      !env.GITHUB_CLIENT_SECRET
    ) {
      return new Response("Environment variables are missing");
    }

    // Create a response with HTTP-only state cookie
    return new Response("Redirecting", {
      status: 307,
      headers: {
        Location: `https://github.com/login/oauth/authorize?client_id=${
          env.GITHUB_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(env.GITHUB_REDIRECT_URI)}&scope=${
          scope || "user:email"
        }&state=${state}`,
        "Set-Cookie": `github_oauth_state=${state}; HttpOnly; Path=/; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }

  // GitHub OAuth callback route
  if (url.pathname === "/callback") {
    // Get the state from URL and cookies
    const urlState = url.searchParams.get("state");
    const cookie = request.headers.get("Cookie");
    const rows = cookie?.split(";").map((x) => x.trim());
    const stateCookie = rows
      ?.find((row) => row.startsWith("github_oauth_state"))
      ?.split("=")[1]
      .trim();

    // Validate state
    if (!urlState || !stateCookie || urlState !== stateCookie) {
      // NB: this breaks things on my mobile
      return new Response(`Invalid state`, { status: 400 });
    }

    const code = url.searchParams.get("code");

    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    try {
      // Immediately exchange token
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
      if (!tokenResponse.ok) {
        throw new Error();
      }
      const { access_token, scope }: any = await tokenResponse.json();

      // Fetch user info from GitHub
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "User-Agent": "Cloudflare-Workers",
        },
      });
      if (!userResponse.ok) throw new Error("Failed to fetch user info");
      const userData: any = await userResponse.json();

      // Ensure sponsors table exists with SQLite-compatible schema
      await env.SPONSORFLARE.exec(
        `CREATE TABLE IF NOT EXISTS sponsors (owner_id TEXT PRIMARY KEY, owner_login TEXT NOT NULL, avatar_url TEXT, is_authenticated INTEGER DEFAULT 0, source TEXT, is_sponsor INTEGER DEFAULT 0, clv INTEGER DEFAULT 0, spent INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
      );

      // Upsert operation using SQLite-compatible boolean handling
      const stmt = env.SPONSORFLARE.prepare(
        `
    INSERT INTO sponsors (owner_id, owner_login, avatar_url, is_authenticated, source)
    VALUES (?1, ?2, ?3, 1, ?4)
    ON CONFLICT(owner_id) DO UPDATE SET
      is_authenticated = 1,
      avatar_url = excluded.avatar_url,
      owner_login = excluded.owner_login
  `,
      ).bind(
        userData.id.toString(),
        userData.login,
        userData.avatar_url,
        url.origin,
      );

      await stmt.run();

      const headers = new Headers({
        Location: url.origin + (env.LOGIN_REDIRECT_URI || "/"),
      });
      headers.append(
        "Set-Cookie",
        `authorization=${encodeURIComponent(
          `Bearer ${access_token}`,
        )}; HttpOnly; Path=/; Secure; Max-Age=34560000; SameSite=Lax`,
      );
      headers.append(
        "Set-Cookie",
        `github_oauth_scope=${encodeURIComponent(
          scope,
        )}; HttpOnly; Path=/; Secure; Max-Age=34560000; SameSite=Lax`,
      );
      headers.append(
        "Set-Cookie",
        `github_oauth_state=; HttpOnly; Path=/; Secure; Max-Age=0; SameSite=Lax`,
      );
      return new Response("Redirecting", { status: 307, headers });
    } catch (error) {
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
              <script>
                alert("Login failed");
                window.location.href = "/";
              </script>
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

export const getSponsor = async (
  request: Request,
  env: Env,
  config?: { charge: number },
): Promise<{
  is_authenticated: boolean;
  owner_login?: string;
  owner_id?: string;
  is_sponsor?: boolean;
  ltv?: number;
  spent?: number;
  charged: boolean;
}> => {
  return {};
};
