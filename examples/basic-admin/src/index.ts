import type { ResourceConfig } from "@openadminjs/core";
import lead from "./resources/lead.resource";

/** Copy resources into `apps/api/src/resources/` and merge this array into `registry.ts`. */
export const basicExampleResources = [lead] satisfies ResourceConfig[];
