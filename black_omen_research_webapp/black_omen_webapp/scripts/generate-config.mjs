import { writeFile } from "node:fs/promises";

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || "";
const contents = `// Generated at deploy time. These values are public browser identifiers.\nwindow.BLACK_OMEN_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2)};\n`;
await writeFile(new URL("../config.js", import.meta.url), contents, "utf8");
console.log(supabaseUrl && supabaseAnonKey ? "Supabase browser configuration generated." : "No Supabase environment values found; building preview mode.");
