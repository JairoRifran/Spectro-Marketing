import { z } from "zod";

const textArray=z.array(z.string().trim().min(1)).default([]);
export const onboardingSchema=z.object({
  organization_id:z.uuid().optional(),
  company:z.object({name:z.string().trim().min(2).max(120),description:z.string().trim().min(10).max(2000),industry:z.string().trim().min(2),website:z.union([z.url(),z.literal("")]).default(""),country:z.string().min(2),primary_language:z.string().min(2),timezone:z.string().min(2)}),
  products:z.array(z.object({name:z.string().min(2),description:z.string().min(5),kind:z.enum(["product","service"]),category:z.string().default(""),value_proposition:z.string().min(5),price_text:z.string().default(""),url:z.union([z.url(),z.literal("")]).default("")})).min(1).max(20),
  personas:z.array(z.object({name:z.string().min(2),description:z.string().min(5),pains:textArray,needs:textArray,motivations:textArray,objections:textArray,channels:textArray,metadata:z.record(z.string(),z.unknown()).default({})})).min(1).max(20),
  brand:z.object({name:z.string().min(2),description:z.string().min(5),slogan:z.string().default(""),tone_of_voice:z.string().min(3),personality:textArray,preferred_words:textArray,forbidden_words:textArray,colors:z.array(z.string()).default([]),visual_instructions:z.string().default(""),communication_examples:z.array(z.unknown()).default([]),forbidden_claims:textArray}),
  objective:z.object({title:z.string().min(5),description:z.string().min(5),metric:z.string().min(2),baseline:z.union([z.number(),z.null()]).default(null),target:z.number().positive(),deadline:z.string().default(""),budget:z.union([z.number().nonnegative(),z.null()]).default(null),market:z.string().default(""),constraints:z.array(z.string()).default([]),priority:z.enum(["low","medium","high","urgent"])}),
});
export type OnboardingInput=z.infer<typeof onboardingSchema>;
