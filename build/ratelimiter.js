import { DurableObject } from "cloudflare:workers";
export class RatelimitDO extends DurableObject {
    static DEFAULT_REQUEST_LIMIT = 25;
    static HOURLY_RESET_MS = 3600000; // 1 hour in milliseconds
    requestLimit;
    resetIntervalMs;
    remainingRequests;
    resetTime;
    constructor(ctx, env) {
        super(ctx, env);
        // Default values will be overridden in checkRequest()
        this.requestLimit = RatelimitDO.DEFAULT_REQUEST_LIMIT;
        this.resetIntervalMs = RatelimitDO.HOURLY_RESET_MS;
        this.remainingRequests = this.requestLimit;
        this.resetTime = Date.now() + this.resetIntervalMs;
    }
    /**
     * Main method to check if a request can proceed and initialize state if needed.
     * This combines the previous initialize() and getMillisecondsToNextRequest() methods.
     *
     * @param options Optional rate limit configuration
     * @returns Object containing wait time and rate limit headers
     */
    async checkRequest(options) {
        // Load stored state if available
        const storedState = (await this.ctx.storage.get([
            "requestLimit",
            "resetIntervalMs",
            "remainingRequests",
            "resetTime",
        ]));
        // Apply options if provided
        if (options) {
            this.requestLimit =
                options.requestLimit || RatelimitDO.DEFAULT_REQUEST_LIMIT;
            this.resetIntervalMs =
                options.resetIntervalMs || RatelimitDO.HOURLY_RESET_MS;
            // Reset the counter when changing limits
            this.remainingRequests = this.requestLimit;
            this.resetTime = Date.now() + this.resetIntervalMs;
        }
        else if (storedState.requestLimit) {
            // Restore from storage if available
            this.requestLimit = storedState.requestLimit;
            this.resetIntervalMs = storedState.resetIntervalMs;
            this.remainingRequests = storedState.remainingRequests;
            this.resetTime = storedState.resetTime;
        }
        // Check if we need to reset based on current time
        await this.checkReset();
        // Calculate wait time
        let waitTime = 0;
        if (this.remainingRequests <= 0) {
            // If no tokens left, calculate wait time until reset
            waitTime = this.resetTime - Date.now();
            waitTime = Math.max(0, waitTime); // Ensure non-negative
        }
        else {
            // Decrement available requests
            this.remainingRequests--;
            waitTime = 0;
        }
        // Create headers object
        const ratelimitHeaders = {
            "X-RateLimit-Limit": this.requestLimit.toString(),
            "X-RateLimit-Remaining": this.remainingRequests.toString(),
            "X-RateLimit-Reset": Math.ceil(this.resetTime / 1000).toString(), // Unix timestamp in seconds
        };
        // Save state after modifications
        await this.saveState();
        // Set alarm for the next reset
        await this.setResetAlarm();
        return {
            waitTime,
            ratelimitHeaders,
        };
    }
    async checkReset() {
        const now = Date.now();
        if (now >= this.resetTime) {
            this.remainingRequests = this.requestLimit;
            this.resetTime = now + this.resetIntervalMs;
        }
    }
    async saveState() {
        await this.ctx.storage.put({
            requestLimit: this.requestLimit,
            resetIntervalMs: this.resetIntervalMs,
            remainingRequests: this.remainingRequests,
            resetTime: this.resetTime,
        });
    }
    async setResetAlarm() {
        const currentAlarm = await this.ctx.storage.getAlarm();
        // Only set a new alarm if one doesn't exist or it's different
        if (currentAlarm === null || currentAlarm !== this.resetTime) {
            await this.ctx.storage.setAlarm(this.resetTime);
        }
    }
    async alarm() {
        // Reset the counter when the alarm triggers
        this.remainingRequests = this.requestLimit;
        this.resetTime = Date.now() + this.resetIntervalMs;
        // Save the new state
        await this.saveState();
        // Set the next alarm
        await this.setResetAlarm();
    }
}
/**
 * Function to rate limit requests based on client IP
 */
export async function ratelimit(request, env, options) {
    // Get client IP from request headers
    const clientIp = request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "127.0.0.1";
    // Get stub for the RateLimiter DO
    const ratelimiterStub = env.RATELIMIT_DO.get(env.RATELIMIT_DO.idFromName(clientIp));
    // Call the checkRequest method directly on the stub using RPC
    const { waitTime, ratelimitHeaders } = await ratelimiterStub.checkRequest(options);
    // If waitTime > 0, request is rate limited
    if (waitTime <= 0) {
        return undefined;
    }
    // Not rate limited, return undefined
    return { waitTime, ratelimitHeaders };
}
