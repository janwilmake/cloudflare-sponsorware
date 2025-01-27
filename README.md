# Sponsorflare - Cloudflare Middleware for easy Monetisation of a worker using GitHub Sponsors

Inspired by [sponsorware](https://github.com/sponsorware/docs) and [this blog](https://calebporzio.com/sponsorware), sponsorflare aims allowing for [cloudflare workers](https://workers.cloudflare.com) monetisation in a few lines of code.

![](flow.drawio.png)

## Usage

Installation:

1. run `cp .dev.vars.example .dev.vars`
2. create a github oauth client at https://github.com/settings/applications/new with the right redirect URI, and get the client ID and secret
3. accept sponsors at your github account. you first need to be approved
4. once accepted, go to: your sponsor dashboard -> webhook -> add webhook
   1. URL: one of your workers at `/github-webhook`
   2. add a secret that you save to `.dev.vars`
   3. content type: JSON
5. run `npm i sponsorflare`
6. run `npx wrangler d1 create sponsorflare` and put the result in wrangler.toml

`wrangler.toml`:

```toml
[vars]
GITHUB_REDIRECT_URI = "https://yourworkerdomain.com/callback"
LOGIN_REDIRECT_URI = "/"

[[d1_databases]]
binding = "SPONSORFLARE"
database_name = "sponsorflare"
database_id = "your-id"
```

`main.ts`:

```typescript
import { middleware, getSponsor } from "sponsorflare";

type Env = {
  SPONSORFLARE: D1;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  LOGIN_REDIRECT_URI: string;
};

export default {
  fetch: async (request: Request, env: Env) => {
    const sponsorflare = middleware(request, env);
    if (sponsorflare) return middleware;

    // Do your worker thing!
    // And if you want to limit stuff...
    // This is a super fast function that just
    // does 2 read queries to the D1 and a write if charging
    const { isAuthenticated, charged } = await getSponsor(request, env, {
      charge: 1,
    });

    if (!charged) {
      return new Response(
        "Payment required. Sponsor me! https://github.com/sponsors/janwilmake",
        { status: 402 },
      );
    }

    // Do your paid stuff here after charging the user
  },
};
```

## TODO POC (2025-01-26)

1. ✅ Create a standalone repo called `cloudflare-sponsorware` that you can just use it with your app to allow for github login, github watching sponsorship events, and keeping the KV. people can use their own github acc and cloudflare acc for this. Open source.
2. ✅ Buy sponsorflare.com and set up the repo and [tweet](https://x.com/janwilmake/status/1883493435635585198)
3. ✅ Make sponsorflare github oauth work (took just 5 minutes!) and create indended demo-layout with Deepseek (took just 1 minute)
4. ✅ Take a deep breath. Look into the apis and find which APIs and webhooks are needed (and validate this is even possible as the way I want it).
5. ✅ Test out retrieving required information from a sponsor with matching userId.
6. ✅ Created getSponsors function.
7. ✅ Create consistent storage: D1 with `type Sponsors={source,ownerId,ownerLogin,clv,spent}` for the POC.
8. ✅ Upsert user upon login
9. ✅ Ensure webhooks get delivered (https://docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries)
10. ✅ Upsert user upon webhook: sync using `getSponsors` storing total livetime value with money spent ensuring it makes sense.
11. ✅ Create `access_tokens` table that maps `access_token` to `sponsorid`
12. ✅ Now I can make function `getSponsor(request,env,config?:{charge?:number})` that charges and/or gets clv/spent of the current request.

Yeah! The Proof of Concept is out there. You can choose to simply use it by installing the package, or use it as a template and build it out further if you so desire. I'm going to be using this for most of my products.

![](poc.png)
