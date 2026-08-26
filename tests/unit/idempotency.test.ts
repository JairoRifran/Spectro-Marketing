import { describe,expect,it } from "vitest";
import { idempotencyKey } from "@/server/idempotency";
describe("idempotency",()=>{it("normalizes equivalent inputs",()=>{expect(idempotencyKey(" Task ","ABC",1)).toBe(idempotencyKey("task","abc",1))});it("keeps occurrences distinct",()=>{expect(idempotencyKey("schedule",1)).not.toBe(idempotencyKey("schedule",2))});it("rejects empty keys",()=>{expect(()=>idempotencyKey(" ")).toThrow()})});
