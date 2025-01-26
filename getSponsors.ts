interface GitHubGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface SponsorLifetimeValue {
  amountInCents: number;
  formattedAmount: string;
}

interface UserSponsor {
  login: string;
  name?: string;
  lifetimeReceivedSponsorshipValues: {
    nodes: SponsorLifetimeValue[];
  };
}

interface OrganizationSponsor {
  login: string;
  name?: string;
}

type SponsorNode = (UserSponsor | OrganizationSponsor) & {
  __typename?: string;
};

interface Viewer {
  monthlyEstimatedSponsorsIncomeInCents: number;
  lifetimeReceivedSponsorshipValues: {
    totalCount: number;
    nodes: SponsorLifetimeValue[];
  };
  sponsors: {
    totalCount: number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
    };
    nodes: SponsorNode[];
  };
  avatarUrl: string;
  login: string;
}

async function fetchSponsorData(token: string): Promise<Viewer> {
  const query = `
      query {
        viewer {
          monthlyEstimatedSponsorsIncomeInCents
          lifetimeReceivedSponsorshipValues(first: 100) {
            totalCount
            nodes {
              amountInCents
              formattedAmount
            }
          }
          sponsors(first: 100) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              ... on User {
                login
                name
                lifetimeReceivedSponsorshipValues {
                  nodes {
                    amountInCents
                    formattedAmount
                  }
                }
              }
              ... on Organization {
                login
                name
              }
            }
          }
          avatarUrl
          login
        }
      }
    `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result: GitHubGraphQLResponse<{ viewer: Viewer }> =
    await response.json();

  if (result.errors) {
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  }

  if (!result.data) {
    throw new Error("No data received from GitHub API");
  }

  return result.data.viewer;
}

// Usage example:
const GITHUB_TOKEN = "your_github_token_here";

fetchSponsorData(GITHUB_TOKEN)
  .then((data) => {
    console.log("Monthly income:", data.monthlyEstimatedSponsorsIncomeInCents);
    console.log("Total sponsors:", data.sponsors.totalCount);

    data.sponsors.nodes.forEach((sponsor) => {
      if ("lifetimeReceivedSponsorshipValues" in sponsor) {
        console.log(
          `User sponsor: ${sponsor.login}`,
          "Lifetime value:",
          sponsor.lifetimeReceivedSponsorshipValues.nodes,
        );
      } else {
        console.log(`Organization sponsor: ${sponsor.login}`);
      }
    });
  })
  .catch((error) => console.error("Error:", error.message));
