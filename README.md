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
5. run `npm i sponsorflare` (or copy over the `sponsorflare.ts` file)

`wrangler.toml`:

```toml
[vars]
GITHUB_REDIRECT_URI = "https://yourworkerdomain.com/callback"
LOGIN_REDIRECT_URI = "/"

[[durable_objects.bindings]]
name = "SPONSOR_DO"
class_name = "SponsorDO"

[[migrations]]
tag = "v1"
new_classes = ["SponsorDO"]
```

`main.ts`:

```ts
import { middleware, getSponsor, Env } from "sponsorflare";
export { SponsorDO } from "./sponsorflare";

export default {
  fetch: async (request: Request, env: Env) => {
    // This middleware adds /login, /callback, and /github-webhook endpoints
    const sponsorflare = middleware(request, env);
    if (sponsorflare) return middleware;

    // If you want to limit stuff
    const { charged } = await getSponsor(request, env, { charge: 1 });

    if (!charged) {
      return new Response("Payment required. Redirecting...", {
        status: 307,
        headers: { Location: "https://github.com/sponsors/janwilmake" },
      });
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

# Update 2025-01-27

I learned that we can improve latency by using user-based DOs rather than a globally central database. This has a side-effect that we can't recall all active users, but that's also not something we need!

So I asked claude to update this code so:

It uses a Durable object instead of d1 database with a storage containing a storage for each access token (the key is the access_token, the value is 'true') and for the sponsor (key is 'sponsor')

1. upon /callback

- it puts the owner_id in a cookie
- it spawns a DO with name equal to `owner_id`
- it sets the access_token and the sponsor in the DO (ensure to use the access_token as key, not value)
- it redirects like it does now (but with extra owner_id cookie)

2. upon `getSponsor`

- it looks for DO with name equals the `owner_id` (from cookie)
- it confirms the access_token provided in the cookie is present in the DO, if not, abort
- it charges if that was requested by updating the sponsor in the DO
- it returns the same information like now in the DO response, then in the response of the function.

After this, I added one more measure for security, namely an idempotency key to a charge, to be sure the charge doesn't occur twice. It also tracks all charges.

There is no way possible to get an overview of all users with this implementation, and we also don't have a way to back up the data! Nevertheless, this is a very powerful way to charge people for using workers, and DO's should be sufficiently reliable to handle this usecase, I think.

Because we're not using a global database but a separate database per user, the response latency is incredibly low! This is because a DO always spawns as nearby the worker as possible, and stays there.
