import { Env as SponsorflareEnv, SponsorDO } from "./sponsorflare";
export { SponsorDO };
export interface Env extends SponsorflareEnv {
    ADMIN_OWNER_LOGIN: string;
    CLOUDFLARE_ACCOUNT_ID: string;
    CLOUDFLARE_NAMESPACE_ID: string;
    CLOUDFLARE_API_KEY: string;
}
declare const _default: {
    fetch: (request: Request, env: Env) => Promise<Response>;
};
export default _default;
