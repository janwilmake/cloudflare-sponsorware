interface Sponsor {
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
  sponsor: Sponsor;
}

interface SponsorshipConnection {
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string;
  };
  nodes: SponsorshipValueNode[];
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
    sponsors: allNodes.map(({ sponsor, ...rest }) => ({ ...rest, ...sponsor })),
  };
}

// its working!
// fetchAllSponsorshipData("").then(
//   (res) => console.dir(res, { depth: 999 }),
// );
