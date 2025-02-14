/** Retrieve stats for your durable objects namespace. This function iterates over all durable objects in the namespace and retrieves the user info */
export const stats = async (accountId, namespaceId, cloudflareApiKey) => {
    try {
        // Initialize an array to store all Durable Object IDs
        const allObjects = [];
        let cursor;
        if (!accountId || !namespaceId) {
            return {
                error: "Missing account_id or namespace_id parameters",
                status: 400,
            };
        }
        // Fetch all Durable Object IDs using pagination
        do {
            const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces/${namespaceId}/objects${cursor ? `?cursor=${cursor}` : ""}`;
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
            const data = await response.json();
            allObjects.push(...data.result);
            cursor = data.result_info?.cursor;
        } while (cursor);
        // Fetch user data from each Durable Object
        const results = await Promise.all(allObjects.map(async (obj) => {
            try {
                // Get Durable Object stub
                const id = env.SPONSOR_DO.idFromString(obj.id);
                const stub = env.SPONSOR_DO.get(id);
                // Fetch user data from the Durable Object
                const response = await stub.fetch("/user");
                if (response.ok) {
                    const userData = await response.json();
                    return {
                        id: obj.id,
                        hasStoredData: obj.hasStoredData,
                        userData,
                    };
                }
                else {
                    throw new Error("No user found");
                }
            }
            catch (error) {
                return {
                    id: obj.id,
                    hasStoredData: obj.hasStoredData,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        }));
        return { status: 200, results };
    }
    catch (error) {
        return {
            error: error instanceof Error ? error.message : "Unknown error",
            status: 500,
        };
    }
};
