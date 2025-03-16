import { DurableObject } from "cloudflare:workers";
export declare const corsHeaders: {
    readonly "Access-Control-Allow-Origin": "*";
    readonly "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS";
    readonly "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Starbase-Source, X-Data-Source";
    readonly "Access-Control-Max-Age": "86400";
};
export declare function corsPreflight(): Response;
export type QueryTransactionRequest = {
    transaction?: QueryRequest[];
};
export type QueryRequest = {
    sql: string;
    params?: any[];
};
export declare function createResponse(result: unknown, error: string | undefined, status: number): Response;
export declare const supportedRoutes: string[];
export declare class BrowsableHandler {
    sql: SqlStorage | undefined;
    constructor(sql: SqlStorage | undefined);
    fetch(request: Request): Promise<Response>;
    executeTransaction(opts: {
        queries: {
            sql: string;
            params?: any[];
        }[];
    }): Promise<any>;
    private executeRawQuery;
    executeQuery(opts: {
        sql: string;
        params?: unknown[];
        isRaw?: boolean;
    }): Promise<Record<string, SqlStorageValue>[] | {
        columns: string[];
        rows: SqlStorageValue[][];
        meta: {
            rows_read: number;
            rows_written: number;
        };
    }>;
}
export declare function Browsable(): <T extends {
    new (...args: any[]): {
        sql?: SqlStorage;
        fetch(request: Request): Promise<Response>;
    };
}>(constructor: T) => {
    new (...args: any[]): {
        _bdoHandler?: BrowsableHandler;
        fetch(request: Request): Promise<Response>;
        sql?: SqlStorage;
    };
} & T;
export declare class BrowsableDurableObject<TEnv = any> extends DurableObject<TEnv> {
    sql: SqlStorage | undefined;
    protected _bdoHandler?: BrowsableHandler;
    constructor(state: DurableObjectState, env: TEnv);
    fetch(request: Request): Promise<Response>;
}
