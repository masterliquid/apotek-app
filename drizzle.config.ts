import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations run as the database owner; the app itself connects as the restricted apotek_app role.
    url: process.env.DATABASE_ADMIN_URL ?? "",
  },
  strict: true,
});
