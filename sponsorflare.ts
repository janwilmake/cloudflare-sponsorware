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
        } = await request.json();

        const already: Sponsor | undefined = await this.storage.get("sponsor", {
          noCache: true,
        });

        await this.storage.put(
          "sponsor",
          {
            ...(already || {}),
            ...initData.sponsor,
          },
          { noCache: true, allowUnconfirmed: false },
        );

        if (initData.access_token) {
          await this.storage.put(initData.access_token, initData.scope);
        }

        return new Response("Initialized", { status: 200 });

      case "/verify":
        const access_token = url.searchParams.get("token");
        const hasToken = await this.storage.get(access_token!);
        if (!hasToken) {
          return new Response("Invalid token", { status: 401 });
        }

        const sponsor = await this.storage.get("sponsor");
        return new Response(JSON.stringify(sponsor), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      case "/charge":
        const chargeAmount = Number(url.searchParams.get("amount"));
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

      default:
        return new Response("Not found", { status: 404 });
    }
  }
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
    sponsors: allNodes.map(({ sponsor: { id, ...user }, ...rest }) => {
      const decodedString = atob(id!); // "04:User4493559"

      // Extract numeric ID
      const parts = decodedString.split(":");
      const numericId = parts[parts.length - 1].replace("User", ""); // "4493559"

      return { id: numericId, ...rest, ...user };
    }),
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

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_PAT: string;
  LOGIN_REDIRECT_URI: string;
  SPONSOR_DO: DurableObjectNamespace;
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

    // Create promises array for all updates
    const updatePromises = [];

    // Update active sponsors
    for (const sponsor of sponsorshipData.sponsors) {
      if (!sponsor.id) continue;

      const id = env.SPONSOR_DO.idFromName(sponsor.id);
      const stub = env.SPONSOR_DO.get(id);

      // Prepare sponsor data
      const sponsorData = {
        owner_id: sponsor.id,
        owner_login: sponsor.login,
        avatar_url: sponsor.avatarUrl,
        is_sponsor: true,
        clv: sponsor.amountInCents,
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

    if (!urlState || !stateCookie || urlState !== stateCookie) {
      return new Response(`Invalid state`, { status: 400 });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    try {
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

      // Fetch user data (keep existing code)
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "User-Agent": "Cloudflare-Workers",
        },
      });

      if (!userResponse.ok) throw new Error("Failed to fetch user info");
      const userData: any = await userResponse.json();

      // Create sponsor object
      const sponsorData = {
        owner_id: userData.id.toString(),
        owner_login: userData.login,
        avatar_url: userData.avatar_url,
        is_authenticated: true,
        source: url.origin,
      };

      // Get Durable Object instance
      const id = env.SPONSOR_DO.idFromName(userData.id.toString());
      const stub = env.SPONSOR_DO.get(id);

      // Initialize the Durable Object with sponsor data and access token
      await stub.fetch(
        new Request("http://fake-host/initialize", {
          method: "POST",
          body: JSON.stringify({
            sponsor: sponsorData,
            access_token,
            scope,
          }),
        }),
      );

      // Create response with cookies
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
        `owner_id=${encodeURIComponent(
          userData.id.toString(),
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

// Update the getSponsor function
export const getSponsor = async (
  request: Request,
  env: Env,
  config?: { charge: number },
): Promise<Partial<Sponsor> & { charged: boolean }> => {
  // Get owner_id and authorization from cookies
  const cookie = request.headers.get("Cookie");
  const rows = cookie?.split(";").map((x) => x.trim());

  const ownerIdCookie = rows?.find((row) => row.startsWith("owner_id="));
  const owner_id = ownerIdCookie
    ? decodeURIComponent(ownerIdCookie.split("=")[1].trim())
    : null;

  const authHeader = rows?.find((row) => row.startsWith("authorization="));
  const authorization = authHeader
    ? decodeURIComponent(authHeader.split("=")[1].trim())
    : request.headers.get("authorization");

  const access_token = authorization
    ? authorization.slice("Bearer ".length)
    : new URL(request.url).searchParams.get("apiKey");

  if (!owner_id || !access_token) {
    return { is_authenticated: false, charged: false };
  }

  try {
    // Get Durable Object instance
    const id = env.SPONSOR_DO.idFromName(owner_id);
    const stub = env.SPONSOR_DO.get(id);

    // Verify access token and get sponsor data
    const verifyResponse = await stub.fetch(
      `http://fake-host/verify?token=${encodeURIComponent(access_token)}`,
    );

    if (!verifyResponse.ok) {
      return { is_authenticated: false, charged: false };
    }

    const sponsorData: Sponsor = await verifyResponse.json();

    // Handle charging if required
    let charged = false;
    if (config?.charge) {
      const idempotencyKey = await generateRandomString(16);
      const chargeResponse = await stub.fetch(
        `http://fake-host/charge?amount=${config.charge}&idempotency_key=${idempotencyKey}`,
      );

      if (chargeResponse.ok) {
        charged = true;
        const updatedData: Sponsor = await chargeResponse.json();
        return {
          is_authenticated: true,
          ...updatedData,
          charged,
        };
      }
    }

    return {
      is_authenticated: true,
      ...sponsorData,
      charged,
    };
  } catch (error) {
    console.error("Sponsor lookup failed:", error);
    return { is_authenticated: false, charged: false };
  }
};
