export function remoteTestsConfigured(required:string[]=[]){
  return process.env.TEST_ENVIRONMENT==="true"&&process.env.DEPLOYMENT_ENVIRONMENT!=="production"&&process.env.VERCEL_ENV!=="production"&&required.every(name=>Boolean(process.env[name]));
}

export function assertSafeRemoteTestEnvironment(){
  if(process.env.TEST_ENVIRONMENT!=="true")throw new Error("Remote fixture mutation requires TEST_ENVIRONMENT=true");
  if(process.env.DEPLOYMENT_ENVIRONMENT==="production"||process.env.VERCEL_ENV==="production")throw new Error("Remote fixture mutation is forbidden in production");
  if(process.env.SUPABASE_PRODUCTION_URL&&process.env.SUPABASE_TEST_URL===process.env.SUPABASE_PRODUCTION_URL)throw new Error("SUPABASE_TEST_URL matches SUPABASE_PRODUCTION_URL");
}
