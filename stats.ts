// Define interfaces for the Durable Object and response types
interface DurableObjectDescription {
  id: string;
  hasStoredData: boolean;
}

interface ListResponse {
  result: DurableObjectDescription[];
  result_info: {
    count: number;
    cursor: string;
    per_page: number;
    total_count: number;
  };
}

interface UserData {
  // Define your user data structure here
  [key: string]: any;
}

/** Retrieve stats for your durable objects namespace. This function iterates over all durable objects in the namespace and retrieves the user info */
export const stats = async (
  accountId: string,
  namespaceId: string,
  cloudflareApiKey: string,
): Promise<{
  status: number;
  results?: {
    id: string;
    hasStoredData: boolean;
    userData?: any;
    error?: string;
  }[];
  error?: string;
}> => {
  try {
    // Initialize an array to store all Durable Object IDs
    const allObjects: DurableObjectDescription[] = [];
    let cursor: string | undefined;
    if (!accountId || !namespaceId) {
      return {
        error: "Missing account_id or namespace_id parameters",
        status: 400,
      };
    }

    // Fetch all Durable Object IDs using pagination
    do {
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces/${namespaceId}/objects${
        cursor ? `?cursor=${cursor}` : ""
      }`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${cloudflareApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return {
          error: `API request failed: ${response.statusText}`,
          status: response.status,
        };
      }

      const data: ListResponse = await response.json();
      allObjects.push(...data.result);
      cursor = data.result_info?.cursor;
    } while (cursor);

    // Fetch user data from each Durable Object
    const results: {
      id: string;
      hasStoredData: boolean;
      userData?: any;
      error?: string;
    }[] = await Promise.all(
      allObjects.map(async (obj) => {
        try {
          // Get Durable Object stub
          const id = env.SPONSOR_DO.idFromString(obj.id);
          const stub = env.SPONSOR_DO.get(id);

          // Fetch user data from the Durable Object
          const response = await stub.fetch("/user");
          if (response.ok) {
            const userData: UserData = await response.json();

            return {
              id: obj.id,
              hasStoredData: obj.hasStoredData,
              userData,
            };
          } else {
            throw new Error("No user found");
          }
        } catch (error) {
          return {
            id: obj.id,
            hasStoredData: obj.hasStoredData,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    return { status: 200, results };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: 500,
    };
  }
};
