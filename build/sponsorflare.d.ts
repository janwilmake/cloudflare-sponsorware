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
    SPONSOR_DO: DurableObjectNamespace;
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
    /** true if the user has ever sponsored */
    is_sponsor?: boolean;
    /** total money the user has paid, in cents */
    clv?: number;
    /** total money spent on behalf of the user (if tracked), in cents */
    spent?: number;
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
export declare class SponsorDO {
    private state;
    private storage;
    constructor(state: DurableObjectState);
    fetch(request: Request): Promise<Response>;
}
export declare function fetchAllSponsorshipData(accessToken: string): Promise<ViewerData>;
export declare const html: (strings: TemplateStringsArray, ...values: any[]) => string;
export declare const middleware: (request: Request, env: Env) => Promise<Response | undefined>;
export declare const getSponsor: (request: Request, env: Env, config?: {
    /** amount to charge in cents */
    charge: number;
    /** if true, total spent amount may surpass clv */
    allowNegativeClv?: boolean;
}) => Promise<Partial<Sponsor> & {
    /** if true, it means the charge was added to 'spent' */
    charged: boolean;
}>;
export declare const getUsage: (request: Request, env: Env) => Promise<{
    usage: Usage[];
    error?: undefined;
} | {
    error: any;
    usage?: undefined;
}>;
export {};
