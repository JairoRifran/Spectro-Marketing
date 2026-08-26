import { describe,expect,it } from "vitest";
import { retryDecision,retryDelayMs } from "@/server/tasks/retry";
describe("retry policy",()=>{it("uses bounded exponential backoff",()=>{expect(retryDelayMs(1)).toBe(30_000);expect(retryDelayMs(3)).toBe(120_000);expect(retryDelayMs(20)).toBe(3_600_000)});it("stops at max attempts",()=>{expect(retryDecision(3,3,true).retry).toBe(false)});it("never retries non retryable failures",()=>{expect(retryDecision(1,3,false)).toEqual({retry:false,delayMs:0})})});
