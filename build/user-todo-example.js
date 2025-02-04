import { DurableObject } from "cloudflare:workers";
import { proxy } from "./sponsorflare";
export class TodoDO extends DurableObject {
    db;
    constructor(state) {
        super(state, env);
        this.db = state.storage.sql;
        this.db.exec(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    async fetch(request) {
        const url = new URL(request.url);
        const headers = new Headers({
            "Content-Type": "application/json",
            "X-Charge": "1",
        });
        try {
            if (url.pathname === "/create" && request.method === "POST") {
                const { text } = await request.json();
                if (!text)
                    return new Response("Text is required", { status: 400 });
                const result = this.db
                    .exec("INSERT INTO todos (text) VALUES (?) RETURNING id", text)
                    .one();
                return new Response(JSON.stringify({
                    id: result.id,
                    success: true,
                }), { headers });
            }
            if (url.pathname === "/update" && request.method === "PUT") {
                const { id, text, completed, } = await request.json();
                if (!id)
                    return new Response("ID is required", { status: 400 });
                const updates = [];
                const params = [];
                if (text !== undefined) {
                    updates.push("text = ?");
                    params.push(text);
                }
                if (completed !== undefined) {
                    updates.push("completed = ?");
                    params.push(completed);
                }
                params.push(id);
                this.db.exec(`UPDATE todos SET ${updates.join(", ")} WHERE id = ?`, ...params);
                return new Response(JSON.stringify({ success: true }), { headers });
            }
            if (url.pathname === "/list" && request.method === "GET") {
                const todos = this.db
                    .exec("SELECT * FROM todos ORDER BY created_at DESC")
                    .toArray();
                return new Response(JSON.stringify(todos), { headers });
            }
            if (url.pathname === "/delete" && request.method === "DELETE") {
                const { id } = await request.json();
                if (!id)
                    return new Response("ID is required", { status: 400 });
                this.db.exec("DELETE FROM todos WHERE id = ?", id);
                return new Response(JSON.stringify({ success: true }), { headers });
            }
            return new Response("Not found", { status: 404 });
        }
        catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers,
            });
        }
    }
}
export default { fetch: proxy("TODO_DO") };
