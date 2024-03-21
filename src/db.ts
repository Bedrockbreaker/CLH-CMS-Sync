import "dotenv/config";

import postgres from "postgres";

export const db = postgres(process.env.DB_URL || "", {
	max: 1, // max number of clients in the pool
	idle_timeout: 30, // seconds
	transform: {undefined: null} // treat javascript's undefined as postgres's null
});