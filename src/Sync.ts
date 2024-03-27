import "dotenv/config";
import { db } from "./db.js";
import { Locales } from "./Locales.js";
import { I18n } from "./I18n.js";
import { WebflowConnection } from "./Webflow.js";

const wf = new WebflowConnection(process.env.WEBFLOW_API_TOKEN || "");
const classes = "6552ba78e1e2c166cb2ee0aa";

// Delete and recreate all items. Should only be used once, before the first sync.
await wf.fetchAllItems(classes).then(items => {
	const promises: Promise<void>[] = [];
	for (let i = 0; i < items.length; i++) {
		if (i > 0) break; // Testing purposes, don't break everything

		const englishItem = items[i];

		// console.log(englishItem);

		promises.push(Promise.all([
			I18n.translate("website.user.classname", {key: `general.offering.${englishItem.fieldData["class-offering"].toLowerCase().replace(/\s|connect/g, "")}`, args: []}, englishItem.fieldData.city),
			I18n.translate("website.user.daysclassheld", englishItem.fieldData["days-class-held"]),
			wf.deleteItem(classes, englishItem.id) // Previous item needs to be deleted first, otherwise a discriminator will be appended to the new item's slug
		]).then(data => wf.createItemAllLocales(classes, {
			[Locales.ENGLISH]: englishItem,
			[Locales.SPANISH]: {isArchived: englishItem.isArchived, isDraft: englishItem.isDraft, fieldData: {
				name: data[0].spanish,
				"days-class-held": data[1].spanish
			}},
			[Locales.CHINESE]: {isArchived: englishItem.isArchived, isDraft: englishItem.isDraft, fieldData: {
				name: data[0].chinese,
				"days-class-held": data[1].chinese
			}}
		})).then(items => console.log(items)));
		// After creating an item in all locales and attempting to publish it, the following response is returned:
		/*
		{
			publishedItemIds: [],
			errors: [ 'ValidationError: Validation Failure' ]
		}
		*/
	}

	return Promise.all(promises);
});

// Sync all items
// TODO: WIP

await db.end();