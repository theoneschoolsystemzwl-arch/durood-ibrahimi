// Firebase Firestore emulator security tests: no cloud credentials or billing.
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,getDoc,setDoc,updateDoc,runTransaction,serverTimestamp}=require("firebase/firestore");
(async()=>{
 const env=await initializeTestEnvironment({
   projectId:"demo-durood",
   firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
 });
 const ownerId="owner-uid", newId="member-two";
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,"system","membership"),{lastNumber:1,ownerUid:ownerId,updatedAt:new Date()});
    await setDoc(doc(db,"members",ownerId),{
      uid:ownerId,username:"owner",role:"owner",name:"Original owner",
      serial:"DI-1",memberNumber:1,disabled:false,inviterUid:null
    });
    await setDoc(doc(db,"usernames","owner"),{uid:ownerId});
    await setDoc(doc(db,"invitations","abc123"),{
      byUid:ownerId,used:false,revoked:false,createdAt:new Date()
    });
  });
  const guestDb=env.unauthenticatedContext().firestore();
  const ownerDb=env.authenticatedContext(ownerId,{owner:true}).firestore();
  const newDb=env.authenticatedContext(newId).firestore();
  await assertFails(getDoc(doc(guestDb,"system","membership")));
  await assertSucceeds(getDoc(doc(newDb,"system","membership")));
  await assertSucceeds(getDoc(doc(newDb,"invitations","abc123")));
  await assertFails(setDoc(doc(newDb,"members",newId),{
    uid:newId,username:"hacker",role:"owner",name:"Hacker",serial:"DI-1",
    memberNumber:1,disabled:false
  }));
  // Reading one's own profile must work without a custom owner claim.
  // This does not grant administrative access or enable creating an owner.
  const unclaimedOwnerDb=env.authenticatedContext(ownerId).firestore();
  await assertSucceeds(getDoc(doc(unclaimedOwnerDb,"members",ownerId)));
  await assertSucceeds(getDoc(doc(ownerDb,"members",ownerId)));
  await assertFails(updateDoc(doc(newDb,"members",ownerId),{role:"owner"}));
  await assertSucceeds(runTransaction(newDb,async tx=>{
    const seqRef=doc(newDb,"system","membership");
    const invitation=doc(newDb,"invitations","abc123");
    const usernameRef=doc(newDb,"usernames","member2");
    const memberRef=doc(newDb,"members",newId);
    const seq=await tx.get(seqRef);
    const invite=await tx.get(invitation);
    const existing=await tx.get(usernameRef);
    const own=await tx.get(memberRef);
    if(!seq.exists()||!invite.exists()||existing.exists()||own.exists())
      throw Error("Invalid seeded signup state");
    tx.update(seqRef,{lastNumber:2,lastMemberUid:newId,updatedAt:serverTimestamp()});
    tx.update(invitation,{used:true,usedByUid:newId,usedAt:serverTimestamp()});
    tx.set(usernameRef,{uid:newId,createdAt:serverTimestamp()});
    tx.set(memberRef,{
      uid:newId,username:"member2",name:"New Member",role:"member",memberNumber:2,
      serial:"DI-2",inviterUid:ownerId,inviteCode:"abc123",disabled:false,
      pledgeAcceptedAt:serverTimestamp(),createdAt:serverTimestamp()
    });
  }));
  await assertFails(updateDoc(doc(newDb,"members",newId),{role:"owner"}));
  await assertFails(updateDoc(doc(newDb,"system","membership"),{lastNumber:999}));
  await assertFails(updateDoc(doc(newDb,"invitations","abc123"),{used:false}));
  await assertSucceeds(setDoc(doc(newDb,"memberPrivate",newId,"prayers","2026-11-22"),{
    date:"2026-11-22",
    statuses:{fajr:"jamat",dhuhr:"solo",asr:"clear",maghrib:"made",isha:"missed"},
    updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(newDb,"memberPrivate",ownerId,"prayers","2026-11-22"),{
    date:"2026-11-22",statuses:{fajr:"jamat"},updatedAt:serverTimestamp()
  }));
  await assertSucceeds(runTransaction(newDb,async tx=>{
    const countRef=doc(newDb,"memberCounts",newId);
    const globalRef=doc(newDb,"publicStats","global");
    const personal=await tx.get(countRef);
    const global=await tx.get(globalRef);
    const amount=10;
    tx.set(countRef,{memberUid:newId,total:(personal.exists()?personal.data().total:0)+amount,
      lastEntryAmount:amount,updatedAt:serverTimestamp()});
    tx.set(globalRef,{totalRecitations:(global.exists()?global.data().totalRecitations:0)+amount,
      lastEntryUid:newId,lastEntryAmount:amount,updatedAt:serverTimestamp()});
  }));
  await assertFails(updateDoc(doc(newDb,"memberCounts",newId),{total:1000000}));
  await assertFails(updateDoc(doc(newDb,"publicStats","global"),{totalRecitations:1000000}));
  await assertSucceeds(updateDoc(doc(ownerDb,"members",newId),{disabled:true,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(newDb,"memberCounts",newId)));
  console.log("Spark security tests passed: DI-2 signup, invite consumption, prayer isolation, recitation consistency, owner control.");
 }finally{await env.cleanup();}
})().catch(err=>{console.error(err);process.exitCode=1;});
