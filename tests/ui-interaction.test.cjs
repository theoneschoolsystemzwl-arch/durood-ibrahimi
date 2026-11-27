// Browser-like UI interactions run with synthetic accounts and isolated
// localStorage. They never access live Firebase Auth or production records.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
// jsdom does not fetch external scripts by default. Inline only the local
// UI helpers that the browser loads before the classic script; never use network.
const html=fs.readFileSync("public/classic-app.html","utf8").replace(/<script src="\.\/(hijri-session|ui-locale|static-locale)\.js\?[^"]*"><\/script>/g,(_,name)=>"<script>"+fs.readFileSync("public/"+name+".js","utf8").replace(/<\/script/gi,"<\\/script")+"</script>");

function build(storage={}){
 const errors=[],virtualConsole=new VirtualConsole();
 virtualConsole.on("jsdomError",error=>errors.push(error));
 const dom=new JSDOM(html,{
   url:"https://ui-test.example/classic-app.html",
   runScripts:"dangerously",pretendToBeVisual:true,virtualConsole,
   beforeParse(window){
     window.scrollTo=()=>{};
     window.alert=()=>{};
     window.structuredClone=global.structuredClone;
     for(const [key,value] of Object.entries(storage))window.localStorage.setItem(key,value);
   }
 });
 dom.window.addEventListener("error",event=>errors.push(event.error||event.message));
 return {dom,errors,window:dom.window,document:dom.window.document};
}
function enter(app,uid="test-owner",num=1,role="owner"){
 const name=role==="owner"?"Test Owner":"Test Member";
 const profile={uid,memberNumber:num,role,name,username:"test",gender:"male"};
 const rows=[{uid,memberNumber:num,role,name,username:"test",gender:"male",joined:new Date("2026-01-01"),disabled:false}];
 app.window.duroodClassicBridge.enter(profile,rows,{memberCounts:{}});
}
function click(app,selector){
 const el=app.document.querySelector(selector);
 assert(el,`Button not found: ${selector}`);
 el.dispatchEvent(new app.window.MouseEvent("click",{bubbles:true,cancelable:true}));
 return el;
}
function submit(app,selector){
 const form=app.document.querySelector(selector);
 assert(form,`Form not found: ${selector}`);
 form.dispatchEvent(new app.window.Event("submit",{bubbles:true,cancelable:true}));
}
function nav(app,section){
 click(app,`button[data-action="nav"][data-value="${section}"]`);
 assert(app.document.querySelector("#main-content"),"Main content disappeared on "+section);
}

(async()=>{
 const app=build();
 try {
   enter(app);
   for(const tab of ["overview","tasbih","namaz","tree","settings","ranking","messages","directory","groups"]){
     nav(app,tab);
   }
   nav(app,"namaz");
   for(const view of ["attendance","timing","qaza"]){
     click(app,`button[data-action="prayer-view"][data-value="${view}"]`);
     assert(app.document.querySelector("#main-content"),"Prayer view crash: "+view);
   }
   const dateInput=app.document.querySelector("#qaza-start");
   assert(dateInput,"Qaza start date missing");
   dateInput.value="2010-05-15";
   submit(app,"#qaza-date-form");
   assert.equal(app.document.querySelector("#qaza-start").value,"2010-05-15");
   const target=app.document.querySelector("#qaza-target");
   target.value="15";
   submit(app,"#qaza-target-form");
   assert.equal(app.document.querySelector("#qaza-target").value,"15");
   const todayQaza=app.document.querySelector('button[data-action="qaza-record"]');
   let paidDay=null,paidPrayer=null;
   if(todayQaza){
     paidDay=todayQaza.dataset.day;paidPrayer=todayQaza.dataset.value;
     click(app,'button[data-action="qaza-record"]');
     assert(app.document.querySelector("#qaza-title"),"Qaza screen did not survive paid button tap");
   }
   const ownerPrivateKey="durood-private-prayer-v3-test-owner";
   const ownerSaved=app.window.localStorage.getItem(ownerPrivateKey);
   assert(ownerSaved,"Owner per-UID prayer backup missing");
   const ownerData=JSON.parse(ownerSaved);
   assert.equal(ownerData.qaza.start,"2010-05-15");
   assert.equal(ownerData.qaza.target,15);
   if(paidDay)assert.equal(ownerData.qaza.done?.[paidPrayer]?.[paidDay],true,
     "Paid Qaza did not persist on device");
   nav(app,"settings");
   const themeInput=app.document.querySelector('input[name="ui-theme"][value="navy-silver"]');
   assert(themeInput,"Profile theme radio button missing");
   themeInput.checked=true;
   themeInput.dispatchEvent(new app.window.Event("change",{bubbles:true}));
   assert.equal(app.document.documentElement.dataset.theme,"navy-silver",
     "Changing profile theme did not apply");


   // Same browser, different member: no Owner date should leak.
   enter(app,"test-member",2,"member");
   nav(app,"namaz");
   click(app,'button[data-action="prayer-view"][data-value="qaza"]');
   assert.notEqual(app.document.querySelector("#qaza-start").value,"2010-05-15");
   assert.equal(app.errors.length,0,app.errors.map(String).join("\n"));
   // Re-create the app from the original locally saved browser state.
   const state=Object.fromEntries(Object.keys(app.window.localStorage).map(key=>
     [key,app.window.localStorage.getItem(key)]));
   const restored=build(state);
   try{
     enter(restored);
     nav(restored,"namaz");
     click(restored,'button[data-action="prayer-view"][data-value="qaza"]');
     assert.equal(restored.document.querySelector("#qaza-start").value,"2010-05-15");
     assert.equal(restored.document.querySelector("#qaza-target").value,"15");
     if(paidDay)assert.equal(JSON.parse(restored.window.localStorage.getItem(ownerPrivateKey))
       .qaza.done?.[paidPrayer]?.[paidDay],true,"Paid Qaza was lost after reload");
     assert.equal(restored.document.documentElement.dataset.theme,"navy-silver",
       "Owner theme was lost after reload");
     assert.equal(restored.errors.length,0,restored.errors.map(String).join("\n"));
   }finally{restored.dom.window.close();}
   console.log("UI smoke test passed: 9 dashboard tabs, 3 prayer views, Qaza forms/paid taps, member isolation and owner theme reload.");
 }finally{app.dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
