import { DurableObject } from "cloudflare:workers";

interface Env {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_NAMESPACE_ID: string;
  CLOUDFLARE_API_KEY: string;
  SPONSOR_DO: DurableObjectNamespace;
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/list-all-users") {
      try {
        // Step 1: Fetch all Durable Object IDs
        const allObjects: DurableObjectDescription[] = [];
        let cursor: string | undefined;

        do {
          const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${
            env.CLOUDFLARE_ACCOUNT_ID
          }/workers/durable_objects/namespaces/${
            env.CLOUDFLARE_NAMESPACE_ID
          }/objects${cursor ? `?cursor=${cursor}` : ""}`;
          console.log({ apiUrl });
          const response = await fetch(apiUrl, {
            headers: {
              Authorization: `Bearer ${env.CLOUDFLARE_API_KEY}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const error = await response.text();
            return new Response(
              `API request failed: ${response.statusText}; ${error}`,
              {
                status: response.status,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const data: ListResponse = await response.json();
          allObjects.push(...data.result);
          cursor = data.result_info?.cursor;
          console.log({ cursor });
        } while (cursor);

        console.log({ allObjects });
        // Step 2: Fetch users from each Durable Object
        const allUsers: any[] = [];
        let n = 0;
        for (const obj of allObjects) {
          n++;
          if (n > 950) {
            break;
          }
          try {
            const id = env.SPONSOR_DO.idFromString(obj.id);
            const stub = env.SPONSOR_DO.get(id);

            const response = await stub.fetch("http://internal/user");

            if (response.ok) {
              const users = await response.json();
              allUsers.push(...users);
            }
          } catch (error) {
            console.error(`Error fetching from DO ${obj.id}:`, error);
          }
        }

        return new Response(
          JSON.stringify({
            total_objects: allObjects.length,
            total_users: allUsers.length,
            allObjects,
            users: allUsers,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            error: error.message || "Unknown error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
