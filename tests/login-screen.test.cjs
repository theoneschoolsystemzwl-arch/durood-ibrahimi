const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("public/app.js","utf8"),classic=fs.readFileSync("public/classic-app.html","utf8"),index=fs.readFileSync("public/index.html","utf8");
test("temporary null auth after verified sign-in stays in recovery, not login",()=>{
 const nodes={},calls=[],ctx={auth:{currentUser:null},appState:{profile:{uid:"u"},signingIn:false,registering:false},lastAuthenticatedUid:"u",authGeneration:1,nullAuthTimer:null,dashboardTimer:null,SESSION_RECOVERY_MS:15000,logoutBlocked:()=>false,sessionText:(ur)=>ur,recoveryText:()=>"Restoring",view:(key,value)=>calls.push([key,value]),$:key=>nodes[key]??=( {} ),clearTimeout:()=>{},setTimeout:(fn,ms)=>{ctx.timeout=fn;assert.equal(ms,15000);return 1;}};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf("function recoverVerifiedSession(){"),src.indexOf("// This local courtesy pause")),ctx);
 ctx.recoverVerifiedSession();ctx.timeout();assert.deepEqual(calls,[["#access",false],["#portal",false],["#loading",true]]);assert.equal(nodes["#loading-signin"].hidden,false);assert.equal(nodes["#loading-retry"].hidden,false);
 ctx.recoverVerifiedSession();ctx.auth.currentUser={uid:"u"};ctx.timeout();assert.equal(nodes["#loading-signin"].hidden,true);
});
test("one login UI and one retry owner",()=>{assert.ok(classic.includes('if(!person&&window.parent!==window)'));assert.ok(src.includes('if(appState.profile||lastAuthenticatedUid)'));assert.ok(index.includes('if(!window.duroodPortalRetryReady)location.reload()'));assert.ok(src.includes('await silentlyReplacedSession(user.uid)'));});
