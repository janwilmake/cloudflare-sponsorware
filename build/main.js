import { getSponsor, getUsage, html, middleware, stats, SponsorDO, } from "./sponsorflare";
import { RatelimitDO } from "./ratelimiter";
export { SponsorDO, RatelimitDO };
export default {
    fetch: async (request, env) => {
        // Handle sponsorflare auth
        const sponsorflare = await middleware(request, env);
        if (sponsorflare)
            return sponsorflare;
        const { is_authenticated, is_sponsor, clv, spent, owner_login, avatar_url, } = await getSponsor(request, env, { charge: 1, allowNegativeClv: true });
        const url = new URL(request.url);
        if (url.pathname === "/stats" && owner_login === env.ADMIN_OWNER_LOGIN) {
            const result = await stats(env, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_NAMESPACE_ID, env.CLOUDFLARE_API_KEY);
            return new Response(JSON.stringify(result, undefined, 2), {
                headers: { "content-type": "application/json" },
            });
        }
        const { usage, error } = await getUsage(request, env);
        // Process usage data for the chart
        const processedData = usage
            ? processUsageData(usage)
            : { dates: [], datasets: [] };
        return new Response(html `<!DOCTYPE html>
        <html lang="en" class="bg-slate-900">
          <head>
            <meta charset="utf8" />
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
              <div class="text-center mt-20 mb-20">
                <h1
                  class="text-5xl font-bold mb-6 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent"
                >
                  Monetize Your Cloudflare AI Agents
                </h1>
                <p class="text-2xl text-slate-300 mb-8">
                  You build AI Agents on Cloudflare Workers, we make sure your
                  users can pay.
                </p>

                <ol class="max-w-md mx-auto text-left space-y-4 mb-8">
                  <li class="flex items-center space-x-3">
                    <span
                      class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white font-medium"
                      >1</span
                    >
                    <span class="text-slate-300"
                      >Set up your AI Agent in Cloudflare Workers</span
                    >
                  </li>
                  <li class="flex items-center space-x-3">
                    <span
                      class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white font-medium"
                      >2</span
                    >
                    <span class="text-slate-300"
                      >User logs in via Github and sponsors you</span
                    >
                  </li>
                  <li class="flex items-center space-x-3">
                    <span
                      class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white font-medium"
                      >3</span
                    >
                    <span class="text-slate-300"
                      >Now they automatically pay per use</span
                    >
                  </li>
                </ol>

                <div class="flex justify-center gap-4">
                  ${is_authenticated
            ? html `
                        <a
                          href="/logout"
                          class="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                          Logout
                        </a>
                        <a
                          href="https://github.com/janwilmake/cloudflare-sponsorware"
                          target="_blank"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          View Installation Instructions (GitHub)
                        </a>
                      `
            : html `
                        <a
                          href="/login?scope=user:email"
                          class="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                          See Demo (GitHub Login)
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

              ${is_authenticated
            ? html `
                    <!-- Dashboard Section -->
                    <div
                      class="bg-slate-800 p-8 rounded-xl text-center mb-12 flex flex-col items-center"
                    >
                      <img src="${avatar_url}" width="50" height="50" />
                      <h2 class="text-2xl font-semibold mb-4">
                        🎉 You're logged in! Welcome, ${owner_login}.
                      </h2>
                      <p class="text-lg text-slate-400 mb-6">
                        You
                        <b class="text-orange-500"
                          >${is_sponsor ? "have" : "have not"}</b
                        >
                        Sponsored me. Your customer lifetime value is now:
                        <b class="font-mono text-orange-400"
                          >$${parseFloat(String((clv || 0) / 100)).toFixed(2)}</b
                        >
                      </p>
                      <p class="py-8 text-lg text-slate-400">
                        To increase CLV you can sponsor me on GitHub:
                        <a
                          href="https://github.com/sponsors/janwilmake"
                          target="_blank"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          Sponsor Me ➔
                        </a>
                      </p>
                      <p class="text-lg text-slate-400 mb-6 py-8">
                        Your cost spent (This demo charges 1 cent each time you
                        refresh):
                        <span class="font-mono text-orange-400"
                          >$${parseFloat(String((spent || 0) / 100)).toFixed(2)}</span
                        >
                      </p>

                      <!-- Usage Chart -->
                      <div class="w-full mt-8" style="height: 400px;">
                        <h3 class="text-xl font-semibold mb-4">Dashboard</h3>

                        <p class="text-slate-500 mt-4">
                          Your credit can be spent at all my workers! Some of
                          the monetized tools include:
                          <a
                            class="text-orange-300 hover:text-orange-500"
                            href="https://dashboard.forgithub.com"
                            >Dashboard for GitHub</a
                          >
                          |
                          <a
                            class="text-orange-300 hover:text-orange-500"
                            href="https://chat.forgithub.com"
                            >Chat for GitHub</a
                          >
                        </p>
                        <p class="text-slate-500 mt-4">
                          You can see how much you spent on each worker per day
                          from here.
                        </p>

                        <div
                          style="position: relative; height: 300px; width: 100%;"
                        >
                          <canvas id="usageChart"></canvas>
                        </div>
                      </div>

                      <script>
                        // Initialize the chart
                        const ctx = document.getElementById("usageChart");
                        const chart = new Chart(ctx, {
                          type: "bar",
                          data: {
                            labels: ${JSON.stringify(processedData.dates)},
                            datasets: ${JSON.stringify(processedData.datasets)},
                          },
                          options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            animation: false,
                            scales: {
                              x: {
                                stacked: true,
                                ticks: { color: "#94a3b8" },
                              },
                              y: {
                                stacked: true,
                                ticks: { color: "#94a3b8" },
                              },
                            },
                            plugins: {
                              legend: {
                                position: "top",
                                labels: { color: "#94a3b8" },
                              },
                            },
                            barThickness: 100,
                          },
                        });
                      </script>
                    </div>
                  `
            : html `
                    <!-- Features Grid -->
                    <p class="text-orange-300 font-bold text-right italic">
                      Just 3 Lines of Code!
                    </p>

                    <!-- Code Showcase -->
                    <div class="bg-slate-800 p-8 rounded-xl mb-20">
                      <pre class="overflow-x-auto">
    <code class="text-sm">
<span class="text-blue-400">const</span> <span class="text-orange-300">sponsorflare</span> = <span class="text-yellow-300">middleware</span>(request, env);
<span class="text-blue-400">if</span> (sponsorflare) <span class="text-blue-400">return</span> sponsorflare;
<span class="text-blue-400">const</span> { charged, ...sponsor } = <span class="text-blue-400">await</span> <span class="text-yellow-300">getSponsor</span>(request, env, { charge: <span class="text-green-300">1</span> });</code>
  </pre>
                    </div>
                  `}

              <!-- Footer -->
              <div
                class="text-center justify-center flex flex-row gap-4 text-slate-500 border-t border-slate-800 pt-12"
              >
                <p>Empowering Cloudflare Developers to Monetize Their Work</p>
                |
                <a
                  href="/readme"
                  class="font-medium hover:text-orange-500 transition-colors"
                >
                  About
                </a>
              </div>
            </main>
          </body>
        </html>`, { headers: { "content-type": "text/html" } });
    },
};
// Helper function to process usage data for the chart
function processUsageData(usage) {
    const dateMap = new Map();
    const hostnames = new Set();
    // Group data by date and collect unique hostnames
    usage.forEach((entry) => {
        const date = entry.date.split("T")[0];
        hostnames.add(entry.hostname);
        if (!dateMap.has(date)) {
            dateMap.set(date, new Map());
        }
        dateMap.get(date).set(entry.hostname, entry.totalAmount || 0); // Convert to dollars
    });
    // Sort dates
    const dates = Array.from(dateMap.keys()).sort();
    // Create datasets for each hostname
    const datasets = Array.from(hostnames).map((hostname, index) => {
        const data = dates.map((date) => dateMap.get(date).get(hostname) || 0);
        // Generate a color based on index
        const hue = (index * 137.5) % 360;
        const color = `hsl(${hue}, 70%, 50%)`;
        return {
            label: hostname,
            data: data,
            backgroundColor: color,
        };
    });
    return { dates, datasets };
}
