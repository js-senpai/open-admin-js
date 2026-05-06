import type { ResourceConfig } from "@openadminjs/core";
import customers from "./resources/customers.resource";
import orderItems from "./resources/order-items.resource";
import orders from "./resources/orders.resource";
import products from "./resources/products.resource";

export const ecommerceExampleResources = [customers, products, orders, orderItems] satisfies ResourceConfig[];
