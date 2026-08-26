const supported = new Set(["*/1 * * * *", "0 */6 * * *", "0 9 * * *", "0 9 * * 1"]);
export function isSupportedCron(expression: string) { return supported.has(expression.trim()); }
export function occurrenceKey(prefix: string, at: Date) { return `${prefix}:${Math.floor(at.getTime() / 1000)}`; }
export function nextOccurrence(expression:string,from:Date){if(!isSupportedCron(expression))throw new Error("unsupported cron expression");const next=new Date(from);if(expression==="*/1 * * * *"){next.setUTCSeconds(0,0);next.setUTCMinutes(next.getUTCMinutes()+1);return next;}if(expression==="0 */6 * * *"){next.setTime(next.getTime()+6*60*60_000);return next;}if(expression==="0 9 * * 1"){next.setUTCDate(next.getUTCDate()+7);return next;}next.setUTCDate(next.getUTCDate()+1);return next;}
