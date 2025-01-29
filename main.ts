import {
  Env,
  getSponsor,
  getUsage,
  html,
  middleware,
  Usage,
} from "./sponsorflare";
export { SponsorDO } from "./sponsorflare";

export default {
  fetch: async (request: Request, env: Env) => {
    // Handle sponsorflare auth
    const sponsorflare = await middleware(request, env);
    if (sponsorflare) return sponsorflare;

    const {
      charged,
      is_authenticated,
      is_sponsor,
      clv,
      spent,
      owner_login,
      avatar_url,
    } = await getSponsor(request, env, { charge: 1, allowNegativeClv: true });

    const { usage, error } = await getUsage(request, env);

    // Process usage data for the chart
    const processedData = usage
      ? processUsageData(usage)
      : { dates: [], datasets: [] };

    return new Response(
      html`<!DOCTYPE html>
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
                  ${is_authenticated
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
                        <a
                          href="/readme"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          About
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
                        <a
                          href="/readme"
                          class="border border-orange-500 text-orange-500 px-6 py-3 rounded-lg font-medium hover:bg-orange-500/10 transition-colors"
                        >
                          About
                        </a>
                      `}
                </div>
              </div>

              ${is_authenticated
                ? html`
                    <!-- Dashboard Section -->
                    <div
                      class="bg-slate-800 p-8 rounded-xl text-center mb-12 flex flex-col items-center"
                    >
                      <img src="${avatar_url}" width="50" height="50" />
                      <h2 class="text-2xl font-semibold mb-4">
                        🎉 You're logged in! Welcome, ${owner_login}.
                      </h2>
                      <p class="text-lg text-slate-400 mb-6">
                        Your customer lifetime value:
                        <span class="font-mono text-orange-400"
                          >$${parseFloat(String((clv || 0) / 100)).toFixed(
                            2,
                          )}</span
                        >
                      </p>
                      <p class="text-lg text-slate-400 mb-6">
                        Your cost spent (charging 1 cent per refresh):
                        <span class="font-mono text-orange-400"
                          >$${parseFloat(String((spent || 0) / 100)).toFixed(
                            2,
                          )}</span
                        >
                      </p>
                      <p class="text-slate-500">
                        Authenticated: ${is_authenticated ? "Yes" : "No"}
                      </p>
                      <p class="text-slate-500">
                        Sponsor: ${is_sponsor ? "Yes" : "No"}
                      </p>
                      <p class="text-slate-500">
                        Charged? ${charged ? "Yes" : "No"}
                      </p>

                      <!-- Usage Chart -->
                      <div class="w-full mt-8" style="height: 400px;">
                        <h3 class="text-xl font-semibold mb-4">
                          Usage by Hostname
                        </h3>
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

                      <p class="text-slate-500 mt-4">
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

// Helper function to process usage data for the chart
function processUsageData(usage: Usage[]) {
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
