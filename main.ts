import { Env, html, middleware } from "./sponsorflare";

export default {
  fetch: async (request: Request, env: Env) => {
    // Handle sponsorflare auth
    const sponsorflare = await middleware(request, env);
    if (sponsorflare) return sponsorflare;

    // Check auth status
    const cookie = request.headers.get("Cookie") || "";
    const accessToken = cookie.includes("authorization=");

    return new Response(
      html`<!DOCTYPE html>
        <html lang="en" class="bg-slate-900">
          <head>
            <meta charset="utf8" />
            <script src="https://cdn.tailwindcss.com"></script>
            <title>
              Sponsorflare - Monetize Cloudflare Workers with GitHub Sponsors
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
                  Sponsorflare
                </h1>
                <p class="text-2xl text-slate-300 mb-8">
                  Monetize Your Cloudflare Workers with GitHub Sponsors
                </p>
                <div class="flex justify-center gap-4">
                  ${accessToken
                    ? html`
                        <a
                          href="/?logout=true"
                          class="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                          Logout
                        </a>
                        <a
                          href="https://github.com/sponsors/janwilmake"
                          target="_blank"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          Sponsor Me ➔
                        </a>
                      `
                    : html`
                        <a
                          href="/login?scope=user:email"
                          class="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                          Login with GitHub
                        </a>
                        <a
                          href="https://github.com/janwilmake/cloudflare-sponsorware"
                          target="_blank"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          View on GitHub
                        </a>
                      `}
                </div>
              </div>

              ${accessToken
                ? html`
                    <!-- Dashboard Section -->
                    <div class="bg-slate-800 p-8 rounded-xl text-center mb-12">
                      <h2 class="text-2xl font-semibold mb-4">
                        🎉 You're logged in!
                      </h2>
                      <p class="text-lg text-slate-400 mb-6">
                        Your customer lifetime value:
                        <span class="font-mono text-orange-400">$0.00</span>
                        (TODO)
                      </p>
                      <p class="text-slate-500">
                        Sponsor to increase your lifetime value and access
                        premium features!
                      </p>
                    </div>
                  `
                : html`
                    <!-- Features Grid -->
                    <div class="grid md:grid-cols-3 gap-8 mb-20">
                      <div class="bg-slate-800 p-8 rounded-xl">
                        <h3 class="text-orange-400 text-xl font-semibold mb-4">
                          ⚡️ Easy Integration
                        </h3>
                        <p class="text-slate-400">
                          Add sponsor verification to your Workers with just a
                          few lines of code.
                        </p>
                      </div>
                      <div class="bg-slate-800 p-8 rounded-xl">
                        <h3 class="text-orange-400 text-xl font-semibold mb-4">
                          🔒 GitHub Sponsors
                        </h3>
                        <p class="text-slate-400">
                          Leverage GitHub's sponsorship infrastructure for
                          seamless monetization.
                        </p>
                      </div>
                      <div class="bg-slate-800 p-8 rounded-xl">
                        <h3 class="text-orange-400 text-xl font-semibold mb-4">
                          💸 Flexible Limits
                        </h3>
                        <p class="text-slate-400">
                          Control access based on lifetime sponsorship value
                          with simple APIs.
                        </p>
                      </div>
                    </div>
                  `}

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
                    <p class="font-medium">Work in Progress</p>
                    <p class="text-sm text-amber-300/80">
                      Follow development on
                      <a
                        href="https://github.com/janwilmake/cloudflare-sponsorware"
                        class="underline hover:text-amber-200"
                        >GitHub</a
                      >
                    </p>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div
                class="text-center text-slate-500 border-t border-slate-800 pt-12"
              >
                <p>Empowering Cloudflare Developers to Monetize Their Work</p>
              </div>
            </main>
          </body>
        </html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
};
