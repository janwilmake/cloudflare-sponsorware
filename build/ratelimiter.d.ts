import { DurableObject } from "cloudflare:workers";
import { Env } from "./sponsorflare";
export interface RateLimitOptions {
    requestLimit: number;
    resetIntervalMs: number;
}
export interface RateLimitHeaders {
    "X-RateLimit-Limit": string;
    "X-RateLimit-Remaining": string;
    "X-RateLimit-Reset": string;
}
export declare class RatelimitDO extends DurableObject {
    static DEFAULT_REQUEST_LIMIT: number;
    static HOURLY_RESET_MS: number;
    private requestLimit;
    private resetIntervalMs;
    private remainingRequests;
    private resetTime;
    constructor(ctx: any, env: Env);
    /**
     * Main method to check if a request can proceed and initialize state if needed.
     * This combines the previous initialize() and getMillisecondsToNextRequest() methods.
     *
     * @param options Optional rate limit configuration
     * @returns Object containing wait time and rate limit headers
     */
    checkRequest(options?: RateLimitOptions): Promise<{
        waitTime: number;
        ratelimitHeaders: RateLimitHeaders;
    }>;
    private checkReset;
    private saveState;
    private setResetAlarm;
    alarm(): Promise<void>;
}
/**
 * Function to rate limit requests based on client IP
 */
export declare function ratelimit(request: Request, env: Env, options?: RateLimitOptions): Promise<{
    waitTime: number;
    ratelimitHeaders: Map<string, string>;
} | undefined>;
