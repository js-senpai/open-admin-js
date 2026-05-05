import type { ResourceConfig } from "@openadminjs/core";
import activities from "./resources/activities.resource";
import companies from "./resources/companies.resource";
import contacts from "./resources/contacts.resource";
import deals from "./resources/deals.resource";

export const crmExampleResources = [companies, contacts, deals, activities] satisfies ResourceConfig[];
