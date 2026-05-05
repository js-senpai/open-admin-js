import type { ResourceConfig } from "@openadminjs/core";
import listings from "./resources/listings.resource";
import payouts from "./resources/payouts.resource";
import sellers from "./resources/sellers.resource";

export const marketplaceExampleResources = [sellers, listings, payouts] satisfies ResourceConfig[];
