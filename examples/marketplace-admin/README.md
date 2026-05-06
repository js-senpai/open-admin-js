# Marketplace Admin

Two-sided platform: seller onboarding, listings moderation, commission rules, payout batches and buyer–seller dispute notes. Mirrors ops dashboards for marketplaces and gig platforms.

**Suggested resources:** `Seller`, `Listing`, `Category`, `Payout`, `Dispute`, `Review` (moderation), `PlatformFeeRule`.

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Seller`, `Listing`, `Payout`. |
| `src/resources/*.resource.ts` | Sellers, listings, payouts. |
| `src/index.ts` | `marketplaceExampleResources`. |

### Merge into your app

See [basic-admin](../basic-admin/README.md#merge-into-your-app).
