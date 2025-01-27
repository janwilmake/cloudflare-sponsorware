declare global {
    var env: Env;
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
export declare function fetchAllSponsorshipData(accessToken: string): Promise<ViewerData>;
export declare const html: (strings: TemplateStringsArray, ...values: any[]) => string;
export interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_REDIRECT_URI: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_PAT: string;
    LOGIN_REDIRECT_URI: string;
    SPONSORFLARE: D1Database;
}
/** Datastructure of a github user - this is what's consistently stored in the SPONSORFLARE D1 database */
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
    /** true if the user has ever sponsored */
    is_sponsor?: boolean;
    /** total money the user has paid, in cents */
    clv?: number;
    /** total money spent on behalf of the user (if tracked), in cents */
    spent?: number;
};
export declare const middleware: (request: Request, env: Env) => Promise<Response | undefined>;
export declare const getSponsor: (request: Request, env: Env, config?: {
    charge: number;
}) => Promise<{
    is_authenticated: boolean;
    owner_login?: string;
    owner_id?: string;
    is_sponsor?: boolean;
    ltv?: number;
    avatar_url?: string;
    spent?: number;
    charged: boolean;
}>;
export {};
