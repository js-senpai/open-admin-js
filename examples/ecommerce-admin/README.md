# E-commerce Admin

Store operations: products with attributes, variants/SKUs, orders and line items, customers, payment/shipment status, and low-stock alerts. Good template for catalog + fulfillment teams.

**Suggested resources:** `Product`, `ProductVariant`, `Order`, `OrderItem`, `Customer`, `InventoryMovement`, `Coupon` (optional).

## Code in this folder

| Path | Purpose |
|------|---------|
| `prisma/models.fragment.prisma` | `Customer`, `Product`, `Order`, `OrderItem`. |
| `src/resources/*.resource.ts` | Customers, products, orders, order line items. |
| `src/index.ts` | `ecommerceExampleResources`. |

### Merge into your app

See [basic-admin](../basic-admin/README.md#merge-into-your-app). This slice uses integer `*Cents` fields; wire money display in the UI if you add a formatter layer.
