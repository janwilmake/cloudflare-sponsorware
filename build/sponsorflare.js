export class SponsorDO {
    state;
    storage;
    constructor(state) {
        this.state = state;
        this.storage = state.storage;
    }
    async fetch(request) {
        const url = new URL(request.url);
        // Handle different operations based on the path
        switch (url.pathname) {
            case "/initialize":
                const initData = await request.json();
                const already = await this.storage.get("sponsor", {
                    noCache: true,
                });
                await this.storage.put("sponsor", {
                    ...(already || {}),
                    ...initData.sponsor,
                }, { noCache: true, allowUnconfirmed: false });
                if (initData.access_token) {
                    await this.storage.put(initData.access_token, {
                        scope: initData.scope,
                        createdAt: Date.now(),
                        source: initData.source,
                    });
                }
                return new Response("Initialized", { status: 200 });
            case "/verify":
                const access_token = url.searchParams.get("token");
                const tokenData = await this.storage.get(access_token);
                if (!tokenData) {
                    return new Response("Invalid token", { status: 401 });
                }
                const sponsor = await this.storage.get("sponsor");
                return new Response(JSON.stringify(sponsor), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            case "/usage":
                const charges = await this.storage.list({
                    prefix: "charge.",
                    allowConcurrency: true,
                });
                const entries = Array.from(charges.values());
                // Group by YYYY-MM-DD and hostname
                const grouped = entries.reduce((acc, entry) => {
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
                }, {});
                // Convert to array and sort by date desc, then hostname
                const result = Object.values(grouped)
                    .sort((a, b) => {
                    const dateCompare = b.date.localeCompare(a.date);
                    if (dateCompare !== 0)
                        return dateCompare;
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
                const sponsor_data = await this.storage.get("sponsor");
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
                    return new Response(JSON.stringify({
                        message: "Charge already processed",
                        charge: existingCharge,
                    }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                const sponsor_data = await this.storage.get("sponsor");
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
export const setCredit = async (request, env) => {
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
export async function fetchAllSponsorshipData(accessToken) {
    if (!accessToken) {
        throw new Error("No Access Token");
    }
    const endpoint = "https://api.github.com/graphql";
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "CloudflareWorker",
    };
    let afterCursor = null;
    let hasNextPage = false;
    let totalCount = 0;
    const allNodes = [];
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
        const result = await response.json();
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
    const sponsors = allNodes.map(({ sponsor: { databaseId, ...user }, ...rest }) => {
        return { id: databaseId, ...rest, ...user };
    });
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
export const html = (strings, ...values) => {
    return strings.reduce((result, str, i) => result + str + (values[i] || ""), "");
};
async function verifySignature(secret, header, payload) {
    let encoder = new TextEncoder();
    let parts = header.split("=");
    let sigHex = parts[1];
    let algorithm = { name: "HMAC", hash: { name: "SHA-256" } };
    let keyBytes = encoder.encode(secret);
    let extractable = false;
    let key = await crypto.subtle.importKey("raw", keyBytes, algorithm, extractable, ["sign", "verify"]);
    let sigBytes = hexToBytes(sigHex);
    let dataBytes = encoder.encode(payload);
    let equal = await crypto.subtle.verify(algorithm.name, key, sigBytes, dataBytes);
    return equal;
}
function hexToBytes(hex) {
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
async function generateRandomString(length) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const callbackGetAccessToken = async (request, env) => {
    const url = new URL(request.url);
    if (env.SKIP_LOGIN === "true") {
        return { access_token: env.GITHUB_PAT, scope: "repo,user" };
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
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
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
    });
    if (!tokenResponse.ok)
        throw new Error();
    const { access_token, scope } = await tokenResponse.json();
    return { access_token, scope, redirectUriCookie };
};
export const middleware = async (request, env) => {
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
        const securePart = env.SKIP_LOGIN === "true" ? "" : " Secure;";
        const domainPart = env.COOKIE_DOMAIN_SHARING === "true" ? ` Domain=${domain};` : "";
        const headers = new Headers({ Location: redirect_uri || "/" });
        headers.append("Set-Cookie", `authorization=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`);
        headers.append("Set-Cookie", `owner_id=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`);
        headers.append("Set-Cookie", `github_oauth_scope=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`);
        return new Response("Redirecting", { status: 302, headers });
    }
    if (url.pathname === "/github-webhook" && request.method === "POST") {
        try {
            const event = request.headers.get("X-GitHub-Event");
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
            const json = JSON.parse(payload);
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
                if (!sponsor.id)
                    continue;
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
                updatePromises.push(stub.fetch(new Request("http://fake-host/initialize", {
                    method: "POST",
                    body: JSON.stringify({
                        sponsor: sponsorData,
                        // We don't have access to individual access tokens here,
                        // so we'll only update the sponsor data
                        access_token: null,
                    }),
                })));
            }
            // Wait for all updates to complete
            await Promise.all(updatePromises);
            return new Response("Received event", {
                status: 200,
            });
        }
        catch (e) {
            console.log({ e });
            return new Response("=== Error In Webhook ===\n" + e.message, {
                status: 500,
            });
        }
    }
    if (url.pathname === "/set-credit") {
        return setCredit(request, env);
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
        if (!env.GITHUB_CLIENT_ID ||
            !env.GITHUB_REDIRECT_URI ||
            !env.GITHUB_CLIENT_SECRET) {
            return new Response("Environment variables are missing");
        }
        const headers = new Headers({
            Location: `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(env.GITHUB_REDIRECT_URI)}&scope=${scope || "user:email"}&state=${state}`,
        });
        const redirect_uri = url.searchParams.get("redirect_uri") || env.LOGIN_REDIRECT_URI;
        const domainPart = env.COOKIE_DOMAIN_SHARING === "true" ? ` Domain=${domain};` : "";
        headers.append("Set-Cookie", `github_oauth_state=${state};${domainPart} HttpOnly; Path=/; Secure; SameSite=Lax; Max-Age=600`);
        headers.append("Set-Cookie", `redirect_uri=${encodeURIComponent(redirect_uri)};${domainPart} HttpOnly; Path=/; Secure; SameSite=Lax; Max-Age=600`);
        // Create a response with HTTP-only state cookie
        return new Response("Redirecting", { status: 302, headers });
    }
    // GitHub OAuth callback route
    if (url.pathname === "/callback") {
        try {
            const { error, status, access_token, scope, redirectUriCookie } = await callbackGetAccessToken(request, env);
            if (error || !access_token) {
                return new Response(error || "Something went wrong: " + status, {
                    status,
                });
            }
            // Fetch user data (keep existing code)
            const userResponse = await fetch("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    "User-Agent": "Cloudflare-Workers",
                },
            });
            if (!userResponse.ok)
                throw new Error("Failed to fetch user info");
            const userData = await userResponse.json();
            const source = redirectUriCookie;
            // Create sponsor object
            const sponsorData = {
                owner_id: userData.id.toString(),
                owner_login: userData.login,
                avatar_url: userData.avatar_url,
                is_authenticated: true,
                source,
            };
            // Get Durable Object instance
            const id = env.SPONSOR_DO.idFromName(userData.id.toString());
            const stub = env.SPONSOR_DO.get(id);
            // Initialize the Durable Object with sponsor data and access token
            await stub.fetch(new Request("http://fake-host/initialize", {
                method: "POST",
                body: JSON.stringify({
                    sponsor: sponsorData,
                    access_token,
                    scope,
                    source,
                }),
            }));
            // Create response with cookies
            const headers = new Headers({
                Location: redirectUriCookie || env.LOGIN_REDIRECT_URI || "/",
            });
            const skipLogin = env.SKIP_LOGIN === "true";
            // on localhost, no 'secure' because we use http
            const securePart = skipLogin ? "" : " Secure;";
            const domainPart = env.COOKIE_DOMAIN_SHARING === "true" && !skipLogin
                ? ` Domain=${domain};`
                : "";
            const cookieSuffix = `;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=34560000; SameSite=Lax`;
            console.log({ cookieSuffix });
            headers.append("Set-Cookie", `authorization=${encodeURIComponent(`Bearer ${access_token}`)}${cookieSuffix}`);
            headers.append("Set-Cookie", `owner_id=${encodeURIComponent(userData.id.toString())}${cookieSuffix}`);
            headers.append("Set-Cookie", `github_oauth_scope=${encodeURIComponent(scope)}${cookieSuffix}`);
            headers.append("Set-Cookie", `github_oauth_state=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`);
            headers.append("Set-Cookie", `redirect_uri=;${domainPart} HttpOnly; Path=/;${securePart} Max-Age=0; SameSite=Lax`);
            return new Response(`Redirecting to ${headers.get("location")}`, {
                status: skipLogin ? 200 : 302,
                headers,
            });
        }
        catch (error) {
            // Error handling
            console.error("ERROR", error);
            return new Response(html `
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
        `, {
                status: 500,
                headers: {
                    "Content-Type": "text/html",
                    // Clear the state cookie in case of error
                    "Set-Cookie": `github_oauth_state=; HttpOnly; Path=/; Secure; Max-Age=0`,
                },
            });
        }
    }
};
// Update the getSponsor function
export const getSponsor = async (request, env, config) => {
    const { owner_id, access_token, scope } = getCookies(request);
    if (!owner_id || !access_token) {
        return {
            is_authenticated: false,
            charged: false,
            access_token,
            scope,
        };
    }
    try {
        // Get Durable Object instance
        const id = env.SPONSOR_DO.idFromName(owner_id);
        const stub = env.SPONSOR_DO.get(id);
        // Verify access token and get sponsor data
        const verifyResponse = await stub.fetch(`http://fake-host/verify?token=${encodeURIComponent(access_token)}`);
        if (!verifyResponse.ok) {
            return {
                is_authenticated: false,
                charged: false,
                access_token,
                scope,
            };
        }
        const sponsorData = await verifyResponse.json();
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
            const chargeResponse = await stub.fetch(`http://fake-host/charge?amount=${config.charge}&idempotency_key=${idempotencyKey}&source=${encodeURIComponent(request.url)}`);
            if (chargeResponse.ok) {
                charged = true;
                const updatedData = await chargeResponse.json();
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
            balance,
            charged,
        };
    }
    catch (error) {
        console.error("Sponsor lookup failed:", error);
        return { is_authenticated: false, charged: false };
    }
};
export const getCookies = (request) => {
    // Get owner_id and authorization from cookies
    const cookie = request.headers.get("Cookie");
    const rows = cookie?.split(";").map((x) => x.trim());
    const ownerIdCookie = rows?.find((row) => row.startsWith("owner_id="));
    const owner_id = ownerIdCookie
        ? decodeURIComponent(ownerIdCookie.split("=")[1].trim())
        : null;
    const scopeCookie = rows?.find((row) => row.startsWith("github_oauth_scope="));
    const scope = scopeCookie
        ? decodeURIComponent(scopeCookie.split("=")[1].trim())
        : null;
    const authCookie = rows?.find((row) => row.startsWith("authorization="));
    const authorization = authCookie
        ? decodeURIComponent(authCookie.split("=")[1].trim())
        : request.headers.get("authorization");
    const access_token = authorization
        ? authorization.slice("Bearer ".length)
        : new URL(request.url).searchParams.get("apiKey");
    return { scope, owner_id, access_token };
};
export const getUsage = async (request, env) => {
    const { owner_id, access_token } = getCookies(request);
    if (!owner_id || !access_token) {
        return { error: "No access" };
    }
    try {
        // Get Durable Object instance
        const id = env.SPONSOR_DO.idFromName(owner_id);
        const stub = env.SPONSOR_DO.get(id);
        // Verify access token and get sponsor data
        const verifyResponse = await stub.fetch(`http://fake-host/usage`);
        if (!verifyResponse.ok) {
            return { error: "Failed to get usage" };
        }
        const usage = await verifyResponse.json();
        return { usage };
    }
    catch (e) {
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
export const proxy = (DO_NAME) => async (request, env) => {
    const sponsorflare = await middleware(request, env);
    if (sponsorflare)
        return sponsorflare;
    const sponsorData = await getSponsor(request, env);
    if (!sponsorData.is_authenticated || !sponsorData.owner_id) {
        return new Response("Unauthorized", { status: 401 });
    }
    // ensure we have the data available
    request.headers.set("sponsor", JSON.stringify(sponsorData));
    const response = await env[DO_NAME].get(env[DO_NAME].idFromName(sponsorData.owner_id)).fetch(request);
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
