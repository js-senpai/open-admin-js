import {describe,it,expect} from "vitest";
import {parseCheckout} from "./payment.service";
describe("checkout contract",()=>{
 const key="unique-checkout-key";
 it("rejects client prices and redirect URLs",()=>{expect(()=>parseCheckout({idempotencyKey:key,items:[{productId:"p1",quantity:1,price:1}]})).toThrow();expect(()=>parseCheckout({idempotencyKey:key,items:[{productId:"p1",quantity:1}],successUrl:"https://example.test"})).toThrow()});
 it("rejects negative, fractional and duplicate quantities",()=>{for(const quantity of [-1,0,1.5,101])expect(()=>parseCheckout({idempotencyKey:key,items:[{productId:"p1",quantity}]})).toThrow();expect(()=>parseCheckout({idempotencyKey:key,items:[{productId:"p1",quantity:1},{productId:"p1",quantity:1}]})).toThrow()});
 it("normalizes cart order for idempotency",()=>expect(parseCheckout({idempotencyKey:key,items:[{productId:"b",quantity:1},{productId:"a",quantity:2}]}).items.map(x=>x.productId)).toEqual(["a","b"]));
});
