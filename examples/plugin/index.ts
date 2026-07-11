import { definePlugin } from "@ostack/plugin-sdk";

export default definePlugin({
  manifest: {
    id: "community.example",
    name: "Example OStack Plugin",
    version: "0.1.0",
    apiVersion: "1",
    description: "Minimal plugin showing explicit permissions",
    permissions: ["project:read"],
    engines: { ostack: ">=0.1.0" }
  },
  activate(context) { context.logger.info("Example plugin activated"); }
});
