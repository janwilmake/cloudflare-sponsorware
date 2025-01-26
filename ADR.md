Insight: github apps are separate from github oauth apps; tried making one but there is no such thing as a sponsor event permission.

We actually need webhooks at our sponsors dashboard!
https://docs.github.com/en/sponsors/integrating-with-github-sponsors/configuring-webhooks-for-events-in-your-sponsored-account

We can then receive the sponsorshipevent
https://docs.github.com/en/rest/using-the-rest-api/github-event-types?apiVersion=2022-11-28#sponsorshipevent

For retrieving clv we need the graphql api.
