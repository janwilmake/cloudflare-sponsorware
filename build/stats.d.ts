import { Env } from "./main";
/** Retrieve stats for your durable objects namespace. This function iterates over all durable objects in the namespace and retrieves the user info */
export declare const stats: (env: Env, accountId: string, namespaceId: string, cloudflareApiKey: string) => Promise<{
    status: number;
    results?: {
        id: string;
        hasStoredData: boolean;
        userData?: any;
        error?: string;
    }[];
    error?: string;
}>;
