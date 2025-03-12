export { stats } from "./stats";
declare global {
    var env: Env;
}
export type Usage = {
    totalAmount: number;
    date: string;
    hostname: string;
    count: number;
};
export interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_REDIRECT_URI: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_PAT: string;
    LOGIN_REDIRECT_URI: string;
    SPONSORFLARE_DO: DurableObjectNamespace;
    /** If 'true', will skip login and use "GITHUB_PAT" for access */
    SKIP_LOGIN: string;
    COOKIE_DOMAIN_SHARING: string;
}
/** Datastructure of a github user - this is what's consistently stored in the SPONSOR_DO storage */
export type Sponsor = {
    /** whether or not the sponsor has ever authenticated anywhere */
    is_authenticated?: boolean;
    /** url where the user first authenticated */
    source?: string;
    /** node id of the user */
    owner_id: string;
    /** github username */
    owner_login: string;
    /** github avatar url */
    avatar_url?: string;
    blog?: string | null;
    bio?: string | null;
    email?: string | null;
    twitter_username?: string | null;
    /** true if the user has ever sponsored */
    is_sponsor?: boolean;
    /** total money the user has paid, in cents */
    clv?: number;
    /** total money spent on behalf of the user (if tracked), in cents */
    spent?: number;
    /** (clv-spent)/100 = balance (in usd) */
    balance?: number;
    /** Updated every time the user is verified through one of their access tokens */
    updatedAt?: number;
    createdAt?: number;
};
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
type CookieValue = {
    access_token: string;
    owner_id: number;
    scope: string;
};
export declare function createCookieSafeToken(data: CookieValue): string;
export declare function parseCookieSafeToken(cookieValue: string): CookieValue | undefined;
export declare class SponsorflareDO {
    private state;
    private storage;
    private sql;
    constructor(state: DurableObjectState, env: Env);
    private initializeSchema;
    fetch(request: Request): Promise<Response>;
    handleInitialize(request: Request): Promise<Response>;
    handleUser(): Promise<Response>;
    handleVerify(url: URL): Promise<Response>;
    handleUsage(): Promise<Response>;
    handleSetCredit(url: URL): Promise<Response>;
    handleCharge(url: URL): Promise<Response>;
}
export declare const setCredit: (request: Request, env: Env) => Promise<Response>;
export declare function fetchAllSponsorshipData(accessToken: string): Promise<ViewerData>;
export declare const html: (strings: TemplateStringsArray, ...values: any[]) => string;
export declare const middleware: (request: Request, env: Env) => Promise<Response | undefined>;
export declare const getSponsor: (request: Request, env: Env, config?: {
    /** amount to charge in cents */
    charge: number;
    /** if true, total spent amount may surpass clv */
    allowNegativeClv?: boolean;
}) => Promise<{
    /** if true, it means the charge was added to 'spent' */
    charged: boolean;
    access_token?: string | null;
    owner_id?: string | null;
    scope?: string | null;
} & Partial<Sponsor>>;
/**
 * Parses authorization details from the cookie, header, or query
 */
export declare const getAuthorization: (request: Request) => {
    scope?: undefined;
    owner_id?: undefined;
    access_token?: undefined;
} | {
    scope: string;
    owner_id: number;
    access_token: string;
};
export declare const getUsage: (request: Request, env: Env) => Promise<{
    usage: Usage[];
    error?: undefined;
} | {
    error: any;
    usage?: undefined;
}>;
/**
Example: This would be a layered DO that first verifies the owner exists, then goes to a different DO for the same owner where the request is executed.

This makes that DO an incredibly simple way to create monetised, user-authenticated workers

Usage:

```
export default {
  fetch: proxy("MY_USER_DO"),
};
```

Example: see `user-todo-example.ts`

*/
export declare const proxy: (DO_NAME: string) => (request: Request, env: Env & {
    [doName: string]: DurableObjectNamespace;
}) => Promise<Response>;
