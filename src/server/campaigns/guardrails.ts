export type GuardrailInput={texts:string[];forbiddenWords:string[];forbiddenClaims:string[];campaignConstraints:string[]};
export type GuardrailReport={passed:boolean;violations:Array<{kind:"forbidden_word"|"forbidden_claim";value:string}>;constraintsReviewed:string[]};

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase();}

export function validateBrandGuardrails(input:GuardrailInput):GuardrailReport{
  const haystack=normalize(input.texts.join(" \n "));
  const violations:GuardrailReport["violations"]=[];
  for(const word of input.forbiddenWords)if(word.trim()&&haystack.includes(normalize(word.trim())))violations.push({kind:"forbidden_word",value:word});
  for(const claim of input.forbiddenClaims)if(claim.trim()&&haystack.includes(normalize(claim.trim())))violations.push({kind:"forbidden_claim",value:claim});
  return{passed:violations.length===0,violations,constraintsReviewed:input.campaignConstraints};
}
