export enum Locales {
	ENGLISH = "6501245cc8bf8aa9d483b104",
	SPANISH = "657ce37cdbd66c75792d9429",
	CHINESE = "65d667943dcdf4188e58f15e"
}

export type Language = Lowercase<keyof typeof Locales>;