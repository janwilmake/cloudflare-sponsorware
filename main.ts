import login, { Env, html } from "./github-login";
import dashboard from "./dashboard.html";
export default {
  fetch: async (request: Request, env: Env) => {
    const response = await login.fetch(request, env);
    if (response) return response;
    const url = new URL(request.url);
    const cookie = request.headers.get("Cookie");
    const rows = cookie?.split(";").map((x) => x.trim());
    const authHeader = rows?.find((row) => row.startsWith("authorization="));
    const authorization = authHeader
      ? decodeURIComponent(authHeader.split("=")[1].trim())
      : request.headers.get("authorization");
    const accessToken = authorization
      ? authorization?.slice("Bearer ".length)
      : url.searchParams.get("apiKey");

    const scope = decodeURIComponent(
      rows
        ?.find((row) => row.startsWith("github_oauth_scope="))
        ?.split("=")[1]
        .trim() || "",
    );

    if (
      url.pathname === "/dashboard" ||
      (accessToken && !url.searchParams.get("home"))
    ) {
      return new Response(dashboard, {
        headers: { "content-type": "text/html" },
      });
    }

    return new Response(
      html`<!DOCTYPE html>
        <html lang="en" class="bg-slate-900">
          <head>
            <meta charset="utf8" />

            <script src="https://cdn.tailwindcss.com"></script>
            <title>
              Monoflare - The Monorepo Solution For Cloudflare Microservices
            </title>
            <style>
              @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");

              body {
                font-family: "Inter", sans-serif;
              }
            </style>
          </head>

          <body class="text-slate-100">
            <main class="max-w-6xl mx-auto px-4 py-16">
              <!-- Hero Section -->
              <div class="text-center mb-20">
                <h1
                  class="text-5xl font-bold mb-6 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent"
                >
                  Monoflare
                </h1>
                <p class="text-2xl text-slate-300 mb-8">
                  The Monorepo Solution for Cloudflare Microservices
                </p>
                <div class="flex justify-center gap-4">
                  <a
                    id="login"
                    href="${accessToken
                      ? "/dashboard"
                      : "/login?scope=user:email,repo"}"
                    class="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    ${accessToken ? "Dashboard" : "Login"}
                  </a>
                  <a
                    href="https://github.com/janwilmake/monoflare"
                    target="_blank"
                    class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>

              <!-- Features Grid -->
              <div id="features" class="grid md:grid-cols-2 gap-8 mb-20">
                <div class="bg-slate-800 p-8 rounded-xl">
                  <h3 class="text-orange-400 text-xl font-semibold mb-4">
                    Zero-Config Deployment
                  </h3>
                  <p class="text-slate-400">
                    Single-file workers automatically become production-ready
                    deployments with routing, security, and configurations
                    generated for you.
                  </p>
                </div>

                <div class="bg-slate-800 p-8 rounded-xl">
                  <h3 class="text-orange-400 text-xl font-semibold mb-4">
                    Smart Compilation
                  </h3>
                  <p class="text-slate-400">
                    Automatic domain detection, dependency management, and
                    environment variable injection - all from your TypeScript
                    code.
                  </p>
                </div>

                <div class="bg-slate-800 p-8 rounded-xl">
                  <h3 class="text-orange-400 text-xl font-semibold mb-4">
                    Unified Tooling
                  </h3>
                  <p class="text-slate-400">
                    Manage KV stores, D1 databases, and Cloudflare APIs through
                    standard TypeScript interfaces and automatic OpenAPI
                    generation.
                  </p>
                </div>
              </div>

              <!-- Status Alert -->
              <div
                class="bg-amber-900/30 border border-amber-800 rounded-lg p-6 mb-12"
              >
                <div class="flex items-center gap-4 text-amber-400">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a3 3 0 01-3-3h6a3 3 0 01-3 3z"
                    />
                  </svg>
                  <div>
                    <p class="font-medium">Early Development Preview</p>
                    <p class="text-sm text-amber-300/80">
                      Follow our progress on
                      <a
                        href="https://x.com/janwilmake/status/1882815278557622711"
                        class="underline hover:text-amber-200"
                        >Twitter</a
                      >
                    </p>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div
                class="text-center text-slate-500 border-t border-slate-800 pt-12"
              >
                <p>Built with ❤️ for the Cloudflare ecosystem</p>
              </div>
            </main>
          </body>
        </html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
};
