declare global {
  var env: Env;
}

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

export const getLifetimeValue = (request: Request, env: Env) => {
  return {};
};
