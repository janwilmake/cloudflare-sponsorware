# Sponsorflare - Cloudflare Middleware for easy Monetisation of a worker using GitHub Sponsors

Inspired by [sponsorware](https://github.com/sponsorware/docs) and [this blog](https://calebporzio.com/sponsorware), sponsorflare aims allowing for [cloudflare workers](https://workers.cloudflare.com) monetisation in a few lines of code.

> [!NOTE]
> This is a work in progress

## Intended usage

```ts
import { middleware, userPaid, getLifetimeValue } from "sponsorflare";

type Env = {
  sponsorflare: KVNamespace;
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
    // and if you want to limit stuff...
    const { ltv, spent } = await getLifetimeValue(request);
    if (spent > ltv) {
      return new Response(
        "Payment required. Sponsor me! https://github.com/sponsors/janwilmake",
        { status: 402 },
      );
    }
  },
};
```

## TODO

1. ✅ Create a standalone repo called `cloudflare-sponsorware` that you can just use it with your app to allow for github login, github watching sponsorship events, and keeping the KV. people can use their own github acc and cloudflare acc for this. Open source.
2. ✅ Buy sponsorflare.com and set up the repo and [tweet](https://x.com/janwilmake/status/1883493435635585198)
3. Actually subscribe to watching all repos upon login (via a waituntil+scheduled api call).
4. Ensure per user I know the source (where/when they logged in)
5. Watch also triggers calculating all repo stuff, so we end up with a file of all repos + calcs that is refreshed each time something changes. 🐐
6. Watch subscriber userId, and subscriber event, store total livetime value with creditSpent ensuring it makes sense. Keep that in a central KV that is reliable: we need probably D1 for consistency.

https://docs.x.com/x-api/enterprise-gnip-2.0/fundamentals/account-activity#managing-subscribed-users

https://docs.github.com/en/rest/using-the-rest-api/github-event-types?apiVersion=2022-11-28#sponsorshipevent
