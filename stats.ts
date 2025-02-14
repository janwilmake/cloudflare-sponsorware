import { Env } from "./sponsorflare";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Initialize an array to store all Durable Object IDs
      const allObjects: DurableObjectDescription[] = [];
      let cursor: string | undefined;

      // Fetch all Durable Object IDs using pagination
      do {
        const url = new URL(request.url);
        const accountId = url.searchParams.get("account_id");
        const namespaceId = url.searchParams.get("namespace_id");

        if (!accountId || !namespaceId) {
          return new Response("Missing account_id or namespace_id parameters", {
            status: 400,
          });
        }

        const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces/${namespaceId}/objects${
          cursor ? `?cursor=${cursor}` : ""
        }`;

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: request.headers.get("Authorization") || "",
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const data: ListResponse = await response.json();
        allObjects.push(...data.result);
        cursor = data.result_info?.cursor;
      } while (cursor);

      // Fetch user data from each Durable Object
      const results = await Promise.all(
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

      return new Response(JSON.stringify(results), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
