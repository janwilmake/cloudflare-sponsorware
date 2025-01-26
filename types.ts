/** see https://docs.github.com/en/webhooks/webhook-events-and-payloads*/
export const events = [
  // general
  "repository",

  // deployment
  "deployment",
  "deployment_status",

  // branch/code changes
  "create",
  "delete",
  "push",
  "check_run", //https://docs.github.com/en/webhooks/webhook-events-and-payloads#check_run (probably can see tests running for any push)

  // discussion
  "discussion",
  "discussion_comment",

  // wiki
  "gollum",

  // issues
  "issues",
  "issue_comment",
  "sub_issues",

  // prs
  "pull_request",
  "commit_comment",
  "pull_request_review",
  "pull_request_review_comment",
  "pull_request_review_thread",

  // any thread (issue,pr,discussion)
  "label",

  // analytics about others interacting with repos
  "star",
  "fork",
  "watch",
] as const;

export const standardWebhooks: WebhookObject = {
  flareoncloud: {
    url: "https://flareoncloud.com/github-webhook",
    description:
      "DEPLOYMENT: For any repo-branch that we can deploy on Cloudflare, deploy changes to any branch or PRs (and remove deployment if branch gets deleted)",
    events: ["push", "delete", "create", "pull_request", "check_run"],
  },

  productsim: {
    url: "https://productsim.com/github-webhook",
    description:
      "TESTING: After deployment is live, test the deployment and validate it using a thread comment",
    events: ["deployment", "deployment_status"],
  },

  shadowbranch: {
    description: "Have shadow branches be up-to-date upon any code-change",
    events: ["push", "delete", "create", "pull_request", "check_run"],
    url: "https://filetransformers.com/github-webhook",
  },

  filetransformers: {
    url: "https://filetransformers.com/github-webhook",
    description: "CREATE: We may want to resolve issues when any talk is done",
    events: [
      "issue_comment",
      "issues",
      "sub_issues",
      "discussion",
      "discussion_comment",
    ],
  },
};

export interface KVNamespace {
  get: <T>(key: string, config: any) => Promise<T>;
  set: (key: string, owner: Owner) => Promise<void>;
}

export type Env = {
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_MASTER_SECRET: string;
  kv: KVNamespace;
};

export type EventType = (typeof events)[number];

type WebhookObject = {
  [slug: string]: { url: string; events: EventType[]; description: string };
};
/** owner details values (key: `owner.[id]` will be requested after ID is found based on PAT ) */
export interface Owner {
  id: number;
  /** github owner */
  login: string;
  /** github PAT of the owner used by githubwatch */
  token: string;
  /** custom webhooks activated for the owner. */
  webhooks: WebhookObject;
}

export const getOwner = async (env: Env, id: number) => {
  return env.kv.get<Owner | undefined>(`owner.${id}`, "json");
};
export const setOwner = async (env: Env, id: number, owner: Owner) => {
  return env.kv.set(`owner.${id}`, owner);
};

interface GitHubUser {
  id: number;
  login: string;
  node_id: string;
  // Add other fields as needed
}

export async function getGitHubUserId(
  token: string,
): Promise<{ id?: number; login?: string; error?: string }> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const userData: GitHubUser = await response.json();
    return {
      id: userData.id,
      login: userData.login,
      error: undefined,
    };
  } catch (error) {
    return {
      error: `Failed to fetch GitHub user data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
