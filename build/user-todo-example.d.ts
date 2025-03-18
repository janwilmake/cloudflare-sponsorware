import { DurableObject } from "cloudflare:workers";
export interface Todo {
    id: number;
    text: string;
    completed: boolean;
    created_at: string;
}
interface Env {
    TODO_DO: DurableObjectNamespace;
}
export declare class TodoDO extends DurableObject {
    private db;
    constructor(state: DurableObjectState, env: Env);
    fetch(request: Request): Promise<Response>;
}
declare const _default: {
    fetch: (request: Request, env: import("./sponsorflare").Env & {
        [doName: string]: DurableObjectNamespace;
    }) => Promise<Response>;
};
export default _default;
