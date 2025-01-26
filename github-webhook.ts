import { events, EventType, getOwner } from "./types";

let encoder = new TextEncoder();

async function verifySignature(secret: string, header: string, payload: any) {
  let parts = header.split("=");
  let sigHex = parts[1];

  let algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

  let keyBytes = encoder.encode(secret);
  let extractable = false;
  let key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    algorithm,
    extractable,
    ["sign", "verify"],
  );

  let sigBytes = hexToBytes(sigHex);
  let dataBytes = encoder.encode(payload);
  let equal = await crypto.subtle.verify(
    algorithm.name,
    key,
    sigBytes,
    dataBytes,
  );

  return equal;
}

function hexToBytes(hex: string) {
  let len = hex.length / 2;
  let bytes = new Uint8Array(len);

  let index = 0;
  for (let i = 0; i < hex.length; i += 2) {
    let c = hex.slice(i, i + 2);
    let b = parseInt(c, 16);
    bytes[index] = b;
    index += 1;
  }

  return bytes;
}

/**
HTTP POST payloads that are delivered to your webhook's configured URL endpoint will contain several special headers:

X-GitHub-Hook-ID: The unique identifier of the webhook.
X-GitHub-Event: The name of the event that triggered the delivery.
X-GitHub-Delivery: A globally unique identifier (GUID) to identify the event.
X-Hub-Signature: This header is sent if the webhook is configured with a secret. This is the HMAC hex digest of the request body, and is generated using the SHA-1 hash function and the secret as the HMAC key. X-Hub-Signature is provided for compatibility with existing integrations. We recommend that you use the more secure X-Hub-Signature-256 instead.
X-Hub-Signature-256: This header is sent if the webhook is configured with a secret. This is the HMAC hex digest of the request body, and is generated using the SHA-256 hash function and the secret as the HMAC key. For more information, see "Validating webhook deliveries."
User-Agent: This header will always have the prefix GitHub-Hookshot/.
X-GitHub-Hook-Installation-Target-Type: The type of resource where the webhook was created.
X-GitHub-Hook-Installation-Target-ID: The unique identifier of the resource where the webhook was created.

To see what each header might look like in a webhook payload, see "Example webhook delivery."*/

export const githubWebhook = async (request: Request, env: any) => {
  console.log("ENTERED GITHUB WEBHOOK");
  const event = request.headers.get("X-GitHub-Event") as EventType | null;
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("No GITHUB_WEBHOOK_SECRET found", {
      status: 500,
    });
  }

  if (!event || !events.includes(event)) {
    console.log("Event not allowed:" + event);

    return new Response("Event not allowed:" + event, {
      status: 405,
    });
  }

  const payload = await request.text();
  const json = JSON.parse(payload);
  const signature256 = request.headers.get("X-Hub-Signature-256");

  if (!signature256 || !json) {
    return new Response("No signature or JSON", {
      status: 400,
    });
  }

  const isValid = await verifySignature(secret, signature256, payload);

  if (!isValid) {
    return new Response("Invalid Signature", {
      status: 400,
    });
  }

  const repo: string = json.repository.name;
  const id: number = json.repository.owner.id;

  if (!repo || !id) {
    return new Response("No repo/owner found", {
      status: 500,
    });
  }

  const owner = await getOwner(env, id);

  if (!owner) {
    return new Response("No owner found", {
      status: 500,
    });
  }

  // TODO forward the events to the right URLs
  console.log("OK", { owner, repo, event, webhookUrls: owner.webhooks });

  return new Response("Received event", {
    status: 200,
  });
};
