import type { ResourceConfig } from "@openadminjs/core";
import posts from "./posts.resource";
import categories from "./categories.resource";
import users from "./users.resource";
import { auditLogsResource, filesResource, settingsResource } from "./system.resource";
import { apiTokensResource, jobLogsResource, notificationsResource } from "./operations.resource";
import { ordersResource, productsResource, transactionsResource, webhookLogsResource } from "./commerce.resource";

export const resources = [
  posts,
  categories,
  users,
  filesResource,
  auditLogsResource,
  settingsResource,
  apiTokensResource,
  notificationsResource,
  jobLogsResource,
  productsResource,
  ordersResource,
  transactionsResource,
  webhookLogsResource
] satisfies ResourceConfig[];

export function getResource(name: string): ResourceConfig | undefined {
  return resources.find((resource) => resource.name === name);
}
