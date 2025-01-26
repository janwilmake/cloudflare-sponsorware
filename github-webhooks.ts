import { mapMany } from "./mapMany";
import { events } from "./types";
interface Repo {
  id: number;
  name: string;
  owner: { login: string; id: number };
  description: string;
  html_url: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  topics: string[];
  archived: boolean;
  private: boolean;
  homepage?: string;
  stargazers_count: number;
  watchers_count: number;
  forks: number;
  open_issues: number;
  watchers: number;
  size: number;
  language: string | null;
  forks_count: number;
}

interface Webhook {
  id: number;
  url: string;
  config: {
    url: string;
  };
}

interface WebhookConfig {
  url: string;
  content_type: string;
  insecure_ssl: string;
}

export async function fetchAllRepos(
  token: string,
  page = 1,
  allRepos: Repo[] = [],
): Promise<Repo[]> {
  const response = await fetch(
    `https://api.github.com/user/repos?page=${page}&per_page=100&sort=updated`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GithubRepoRetriever",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const newRepos: Repo[] = await response.json();
  allRepos = allRepos.concat(newRepos);

  if (newRepos.length === 100) {
    return fetchAllRepos(token, page + 1, allRepos);
  } else {
    return allRepos;
  }
}

async function fetchWebhooks(
  token: string,
  owner: string,
  repo: string,
): Promise<Webhook[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      headers: {
        "User-Agent": "GithubHooksFetcher",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch webhooks for ${owner}/${repo}. Status: ${
        response.status
      }; \n\n${await response.text()}`,
    );
  }

  return response.json();
}

async function createWebhook(
  env: any,
  token: string,
  owner: string,
  repo: string,
  webhookUrl: string,
): Promise<{ error?: string; status: number }> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return { error: "No process.env.GITHUB_WEBHOOK_SECRET set", status: 500 };
  }
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        "User-Agent": "GithubHooksPoster",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events,
        config: {
          url: webhookUrl,
          content_type: "json",
          secret: env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: "0",
        } as WebhookConfig,
      }),
    },
  );

  if (!response.ok) {
    return {
      error: `Failed to create webhook for ${owner}/${repo}. Status: ${response.status}`,
      status: response.status,
    };
  }
  return { status: 200 };
}

/** Can be used if we are making a request to a repo that hasn't been indexed yet */
export async function registerWebhookIfNeeded(
  env: any,
  token: string,
  webhookUrl: string,
  owner: string,
  repo: string,
): Promise<{ created: boolean; message: string; status: number }> {
  try {
    const existingWebhooks = await fetchWebhooks(token, owner, repo);
    const webhookExists = existingWebhooks.some(
      (webhook) => webhook.config.url === webhookUrl,
    );

    if (!webhookExists) {
      const { status, error } = await createWebhook(
        env,
        token,
        owner,
        repo,
        webhookUrl,
      );
      return {
        created: !error,
        status,
        message: error || `Created webhook for ${owner}/${repo}`,
      };
    } else {
      return {
        created: false,
        status: 200,
        message: `Webhook already exists for ${owner}/${repo}`,
      };
    }
  } catch (error: any) {
    return {
      created: false,
      status: 500,
      message: `Error processing ${owner}/${repo}: ${error.message}`,
    };
  }
}

/** NB: Lets take a good look at github ratelimit  */
export async function createWebhooksForAllRepos(
  env: any,
  activeRepos: Repo[],
  token: string,
  webhookUrl: string,
  concurrency: number = 6,
): Promise<{
  activeRepoCount: number;
  totalWebhookCount: number;
  newWebhookCount: number;
  error?: string;
}> {
  try {
    const results = await mapMany(
      activeRepos,
      (repo) =>
        registerWebhookIfNeeded(
          env,
          token,
          webhookUrl,
          repo.owner.login,
          repo.name,
        ),
      concurrency,
    );

    results.forEach((result) =>
      result.status !== 200 ? console.log(result) : undefined,
    );

    return {
      totalWebhookCount: results.filter((x) => x.status === 200).length,
      activeRepoCount: activeRepos.length,
      newWebhookCount: results.filter((x) => x.created).length,
    };
  } catch (error: any) {
    console.error("Error creating webhooks:", error);
    return {
      totalWebhookCount: 0,
      activeRepoCount: 0,
      newWebhookCount: 0,
      error: error.message || "Error creating webhooks",
    };
  }
}
