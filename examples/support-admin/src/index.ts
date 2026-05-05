import type { ResourceConfig } from "@openadminjs/core";
import ticketMessages from "./resources/ticket-messages.resource";
import tickets from "./resources/tickets.resource";

export const supportExampleResources = [tickets, ticketMessages] satisfies ResourceConfig[];
