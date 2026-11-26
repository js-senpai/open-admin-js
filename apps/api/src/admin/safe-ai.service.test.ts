import { describe,it,expect } from "vitest";
import { publicIPv4 } from "./safe-ai.service";
describe("AI egress",()=>{
 it("rejects loopback, metadata, private, carrier and documentation addresses",()=>{for(const ip of ["127.0.0.1","169.254.169.254","10.0.0.1","172.16.0.1","192.168.1.1","100.64.0.1","192.0.2.2","::1","::ffff:127.0.0.1"])expect(publicIPv4(ip)).toBe(false)});
 it("allows public IPv4",()=>expect(publicIPv4("8.8.8.8")).toBe(true));
});
