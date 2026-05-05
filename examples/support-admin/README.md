# Support / Helpdesk Admin

Customer success stack: tickets with priority and status, assignment to agents, SLA timers, internal notes vs public replies, and optional macros/canned responses.

**Suggested resources:** `Ticket`, `TicketMessage`, `Agent`, `Team`, `Macro`, `SlaPolicy`, `Customer` (link to CRM or reuse contact model).

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Ticket`, `TicketMessage`. |
| `src/resources/tickets.resource.ts` | Ticket resource. |
| `src/resources/ticket-messages.resource.ts` | Message rows linked to tickets. |
| `src/index.ts` | `supportExampleResources`. |

### Merge into your app

See [basic-admin](../basic-admin/README.md#merge-into-your-app). Prisma client exposes `ticketMessage` for model `TicketMessage`; the resource name is `ticket-messages` (kebab-case).
