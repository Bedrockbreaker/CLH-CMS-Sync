# CLH CMS Sync

## Sync.ts
Main file. Syncs data to a Webflow CMS system.

## Webflow.ts
Contains a helper class which abstracts Webflow's API and makes it easier to work with, while providing automatic rate limiting adjustment.  
Uses promises extensively, no callback support.  
Multiple instances using the same api key DO work nicely together, in terms of rate limiting.  
Usage:
```ts
import { WebflowConnection } from "./Webflow.ts";

// Provide your api token here, such as through dotenv
const wf = new WebflowConnection(API_TOKEN);

wf.fetchAllItems("123abc456def").then(console.log);
```

## I18n.ts
Another helper class to automatically translate strings stored in a PostgreSQL database.  
Usage:
```ts
import { I18n } from "./I18n.ts";

funtion getClassHeading(classOffering: string, city: string) {
  return await I18n.translate(
    "website.user.classname",
    {key: `general.offering.${classOffering}`, args: []}, // Recursively translates as needed
    city
  );
}

console.log(getClassHeading("english1", "Dallas, TX"));
```