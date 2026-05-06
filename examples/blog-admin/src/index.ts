import type { ResourceConfig } from "@openadminjs/core";
import authors from "./resources/authors.resource";
import tags from "./resources/tags.resource";

export const blogExampleResources = [authors, tags] satisfies ResourceConfig[];
