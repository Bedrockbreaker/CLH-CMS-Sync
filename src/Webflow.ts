import "dotenv/config";
import { Locales } from "./Locales.js";

export interface GetItemsResponse {
	items: Item[];
	pagination: {limit: number, offset: number, total: number};
}

export interface FieldData {
	name: string;
	slug: string;
	active: boolean;
	"is-virtual": boolean;
	"start-date": string;
	"end-date": string;
	"maps-link": string;
	"class-offering": string;
	"class-language": string;
	"days-class-held": string;
	"start-time-3": string;
	"class-end-3": string;
	city: string;
	state: string;
	"address-formatted": string;
	region: string;
}

export interface Item {
	id: string;
	cmsLocaleId: Locales;
	lastPublished: string;
	lastUpdated: string;
	createdOn: string;
	isArchived: boolean;
	isDraft: boolean;
	fieldData: FieldData
}

export interface ItemData {
	cmsLocaleId?: Locales;
	isArchived: boolean;
	isDraft: boolean;
	fieldData: FieldData;
}

export type PartialItemData = Omit<ItemData, "fieldData"> & {fieldData: Partial<FieldData>}

export interface RequestOptions {
	endpoint: string;
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	body?: object;
}

interface Request extends RequestOptions {
	resolve: (value: unknown) => void;
	reject: (value: unknown) => void;
}

export class WebflowConnection {

	public PRIMARY_LOCALE: Locales;
	public queue: Request[] = [];
	
	private token: string;
	private ratelimit: number = 120;
	private isFetching: boolean = false;

	constructor(token: string, primaryLocale: Locales = Locales.ENGLISH) {
		this.token = token;
		this.PRIMARY_LOCALE = primaryLocale;
	}

	/**
	 * Fetches all items in a collection in the primary locale
	 */
	async fetchAllItems(collectionId: string) {
		return this.fetchItems(collectionId).then(async response => {
			const items = response.items;
			const totalItems = response.pagination.total;
			const promises: Promise<any>[] = [];

			for (let i = 1; i < Math.ceil(totalItems / 100); i++) {
				promises.push(this.fetchItems(collectionId, 100, i * 100).then(response => items.push(...response.items)));
			}

			return Promise.all(promises).then(() =>  items);
		});
	}

	/**
	 * Fetches items in a collection in the primary locale
	 */
	async fetchItems(collectionId: string, limit: number = 100, offset: number = 0): Promise<GetItemsResponse> {
		return this.fetch(`collections/${collectionId}/items?offset=${offset}&limit=${limit}`);
	}

	/**
	 * Fetches a specific item in a collection
	 */
	async fetchItem(collectionId: string, itemId: string, localeId?: Locales): Promise<Item | undefined> {
		return this.fetch(`collections/${collectionId}/items/${itemId}?${localeId ? `cmsLocaleId=${localeId}` : ""}`)
			.then((item: Item) => !item.id ? undefined : item);
	}

	/**
	 * Fetches all locale objects
	 */
	async fetchLocales() {
		return this.fetch("sites/65012459c8bf8aa9d483a9f7").then(siteData => siteData.locales);
	}

	/**
	 * Updates an item in a collection. If `live` is true, the item will be auto-published
	 */
	async updateItem(collectionId: string, itemId: string, itemData: PartialItemData, live: boolean = true): Promise<Item> {
		return this.fetch({
			endpoint: `collections/${collectionId}/items/${itemId}${live ? "/live" : ""}`,
			method: "PATCH",
			body: {isArchived: itemData.isArchived, isDraft: itemData.isDraft, fieldData: itemData.fieldData, cmsLocaleId: itemData.cmsLocaleId}
		});
	}
	
	/**
	 * Creates an item in a collection. If `live` is true, the item will be auto-published
	 */
	async createItem(collectionId: string, itemData: ItemData, live: boolean = true): Promise<Item> {
		return this.fetch({
			endpoint: `collections/${collectionId}/items${live ? "/live" : ""}`,
			method: "POST",
			body: {isArchived: itemData.isArchived, isDraft: itemData.isDraft, fieldData: itemData}
		});
	}
	
	/**
	 * Creates an item in a collection in all locales. If `live` is true, the item will be auto-published.  
	 * Will throw an error if the primary locale in `itemData` does not extend `ItemData`
	 */
	async createItemAllLocales(collectionId: string, itemData: Record<Locales, PartialItemData>, live: boolean = true): Promise<Item[]> {
		const promise = this.fetch({
			endpoint: `collections/${collectionId}/items/bulk`,
			method: "POST",
			body: {
				isArchived: itemData[this.PRIMARY_LOCALE].isArchived,
				isDraft: itemData[this.PRIMARY_LOCALE].isDraft,
				fieldData: itemData[this.PRIMARY_LOCALE].fieldData,
				cmsLocaleIds: Object.keys(itemData)
			}
		}).then(({items}: {items: Item[]}) => {
			const mainItem = items.find(item => item.cmsLocaleId === this.PRIMARY_LOCALE)!;
			const promises: Promise<Item>[] = [];
			for (const locale of Object.keys(itemData) as Locales[]) {
				if (locale === this.PRIMARY_LOCALE) continue;
				promises.push(this.updateItem(collectionId, mainItem.id, {cmsLocaleId: locale, ...itemData[locale]}, false));
			}
			return Promise.all([mainItem, ...promises]);
		});
		// Bulk creation doesn't support the live endpoint (auto-publish)
		if (live) promise.then(items => this.publishItems(collectionId, [items[0].id])).then(console.log);
		return promise;
	}

	/**
	 * Publishes items in a collection
	 */
	async publishItems(collectionId: string, itemIds: string[]): Promise<string[]> {
		return this.fetch({endpoint: `collections/${collectionId}/items/publish`, method: "POST", body: {itemIds}});
	}
	
	/**
	 * Deletes an item in a collection. If `live` is true, the item will be deleted from the live site.  
	 * Defaults to deleting from all locales
	 */
	async deleteItem(collectionId: string, itemId: string, localeIds: Locales[] = Object.values(Locales), live: boolean = true): Promise<void[]> {
		// Despite Webflows's API documentation, the `?cmsLocaleIds` query must be a string, not an array -- hence the separate deletion requests
		return Promise.all(localeIds.map(locale => {
			// Intentional inversion of the live parameter. The "/live" endpoint here really just unpublishes an item.
			return this.fetch({endpoint: `collections/${collectionId}/items/${itemId}${live ? "" : "/live"}?cmsLocaleIds=${locale}`, method: "DELETE"});
		}));
	}

	/**
	 * Generic fetch utility method
	 */
	fetch(options: string): Promise<any>
	fetch(options: RequestOptions): Promise<any>
	fetch(options: RequestOptions | string) {
		if (typeof options === "string") options = {endpoint: options};
		const request: Request = {...options, resolve: () => {}, reject: () => {}};
		const promise = new Promise<any>((resolve, reject) => {
			request.resolve = resolve;
			request.reject = reject;
		});
		this.queue.push(request);
		this.request();
		return promise;
	}

	/**
	 * Flushes the request queue and handles rate limiting
	 */
	private async request() {
		if (this.isFetching) return;
		const request = this.queue.shift();
		if (!request) return;

		console.log(this.ratelimit, request.method || "GET", request.endpoint);
		this.isFetching = true;
		fetch(
			`https://api.webflow.com/beta/${request.endpoint}`,
			{
				method: request.method || "GET",
				headers: {"Content-Type": "application/json", Authorization: `Bearer ${this.token}`},
				body: request.body ? JSON.stringify(request.body) : undefined
			}
		).then(response => {
			this.isFetching = false;
			this.ratelimit = Number(response.headers.get("x-ratelimit-remaining")) || 0;

			if (response.status > 299) {
				console.error(request);
				console.error(response.status, response.statusText);
				request.reject(response.headers.get("Content-Type")?.includes("application/json") ? response.json() : response.text());
			} else {
				request.resolve(response.headers.get("Content-Type")?.includes("application/json") ? response.json() : response.text());
			}

			if (this.queue.length) setTimeout(() => this.request(), this.ratelimit < 60 ? 1000 * (60 - this.ratelimit) : 0);
		});
	}
}