import { db } from "./db.js";
import { Locales, type Language } from "./Locales.js";

type Arg = string | {key: string, args: Arg[]};

export class I18n {

	// TODO: cache invalidation
	private static cache = new Map<string, Record<Language, string>>();

	static {
		db<Record<Language | "key", string>[]>`SELECT "key",${db(Object.keys(Locales).map(key => key.toLowerCase()))} FROM i18n WHERE key LIKE 'general%'`.then(rows => {
			for (const row of rows) {
				const {key, ...locales} = row;
				I18n.cache.set(key, locales);
			}
		});
	}
	
	/**
	 * Translates a key into the given locale. If no locale is given, it returns translations for all locales.  
	 * If any formatting arg is an object, it will be recursively translated.
	 * @example
	 * ```
	 * translate("text.user.newregistration.firstclass", "spanish", "4/20");
	 * // => "La primera clase se llevará a cabo el 4/20"
	 * translate("email.user.classreminder.subject", {key: "general.offering.emotionalresilience", args: []});
	 * // => {"english": "Emotional Resilience Class", "spanish": "Clase de Resiliencia Emocional", "chinese": "情绪恢复课程"}
	 * ```
	 */
	static async translate(key: string, locale: Language, ...args: Arg[]): Promise<string>
	static async translate(key: string, ...args: Arg[]): Promise<Record<Language, string>>
	static async translate(key: string, ...localeArgs: [Language | Arg, ...Arg[]]) {
		let [localeArg, ...args] = localeArgs;

		if (typeof localeArg === "object" || !Object.keys(Locales).map(key => key.toLowerCase()).includes(localeArg)) {
			args.unshift(localeArg as Arg);
			localeArg = "" as Arg;
		}
		const locale = localeArg as Language | "";

		return Promise.all(args.map(arg => {
			if (typeof arg === "object") return locale ? I18n.translate(arg.key, locale, ...arg.args) : I18n.translate(arg.key, ...arg.args);
			return arg as string;
		})).then(translations => {
			const translatedArgs = translations.reduce((map, translation) => {
				if (!translation) return map;
				if (typeof translation === "string") return Object.fromEntries(Object.entries(map).map(pair => [pair[0], [...pair[1], translation]])) as Record<Language, string[]>;
				return Object.fromEntries(Object.entries(map).map(pair => [pair[0], [...pair[1], translation[pair[0]]]])) as Record<Language, string[]>;
			}, Object.fromEntries(Object.keys(Locales).map(key => [key.toLowerCase(), [] as string[]])) as Record<Language, string[]>);

			if (I18n.cache.has(key)) return locale ? I18n.formatSpecial(I18n.cache.get(key)![locale], locale, ...translatedArgs[locale]) : I18n.formatSpecial(I18n.cache.get(key)!, translatedArgs);

			return db<Record<Language, string>[]>`SELECT ${db(Object.keys(Locales).map(key => key.toLowerCase()))} FROM i18n WHERE key = ${key}`
				.then(rows => {
					I18n.cache.set(key, rows[0]);
					return locale ? I18n.formatSpecial(I18n.cache.get(key)![locale], locale, ...translatedArgs[locale]) : I18n.formatSpecial(I18n.cache.get(key)!, translatedArgs);
				});
		});
	}

	/**
	 * Formats a java-style string with the given arguments. Handles locale-specific special cases.  
	 * - `%w`: Args containing English names of the days of the week when passed to this formatting code will be translated.
	 * @example
	 * ```
	 * formatSpecial("%s is open %w", "english", "Ramen Deluxe™️", "Monday through Friday");
	 * // => "Ramen Deluxe™️ is open Monday through Friday"
	 * 
	 * formatSpecial(
	 * 	{
	 * 		english: "%s is open %w",
	 * 		spanish: "%s es abierto %w",
	 * 		chinese: "%s%w营业"
	 * 	},
	 * 	{
	 * 		english: ["Ramen Deluxe™️", "Monday through Friday"],
	 * 		spanish: ["Ramen Deluxe™️", "tuesday y sAtUrDaY"],
	 * 		chinese: ["Ramen Deluxe™️", "Wednesday and Snuday"]
	 * 	}
	 * );
	 * // => {english: "Ramen Deluxe™️ is open Monday through Friday", spanish: "Ramen Deluxe™️ es abierto en Martes y Sábado", chinese: "Ramen Deluxe™️周三 and Snuday开放"}
	 * // Notice how words which don't match english days of the week are left untranslated
	 * ```
	 * @see {@link I18n.format}
	 */
	static formatSpecial(formatter: string, locale: Language, ...args: string[]): string
	static formatSpecial<T extends {[key in Language]: string}, U extends Record<keyof T, string[]>>(formatter: T, ...args: [U]): Record<keyof T, string>
	static formatSpecial<T extends {[key in Language]: string}, U extends Record<keyof T, string[]>>(formatter: string | T, ...localeArgs: string[] | [U]) {
		if (typeof formatter === "object") return Object.fromEntries(Object.entries(formatter).map(([key, value]) => [key, I18n.formatSpecial(value, key as Language, ...localeArgs[0][key])]));

		const [locale, ...args] = localeArgs as [Language, ...string[]];

		console.log("Formatting", formatter, locale, args);

		if (!Object.keys(Locales).map(key => key.toLowerCase()).includes(locale)) throw new Error("No locale provided");

		let i = 0;
		return formatter.replace(/%(\d*?)([sw])/g, (match, number, tag) => {
			i++;
			const arg = args[(Number(number) || i)-1] || match;
			switch (tag) {
				case "s":
					return arg;
				case "w":
					const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
					return arg.replace(new RegExp(days.join("|"), "gi"), match => I18n.cache.get(`general.day${days.indexOf(match.toLowerCase())}`)![locale]);
				default:
					return arg; // Shouldn't happen
			}
		});
	}

	/**
	 * Formats a java-style string with the given arguments.
	 * @example
	 * ```
	 * format("My %s is %s", "name", "cool");
	 * // => "My name is cool"
	 * format({key1: "Hello %2s", key2: "Goodbye %s"}, {key1: ["World", "There!"], key2: []});
	 * // => {key1: "Hello There!", key2: "Goodbye %s"}
	 * ```
	 */
	static format(formatter: string, ...args: string[]): string
	static format<T extends {[key: string]: string}, U extends Record<keyof T, string[]>>(formatter: T, ...args: [U]): Record<keyof T, string>
	static format<T extends {[key: string]: string}, U extends Record<keyof T, string[]>>(formatter: string | T, ...args: string[] | [U]) {
		if (typeof formatter === "object") return Object.fromEntries(Object.entries(formatter).map(([key, value]) => [key, I18n.format(value, ...args[0][key])]));
		
		console.log("Formatting", formatter, args);

		let i = 0;
		const stringArgs = args as string[];
		return formatter.replace(/%(\d*?)s/g, (match, number) => {
			i++;
			return stringArgs[(Number(number) || i)-1] || match;
		});
	}
}