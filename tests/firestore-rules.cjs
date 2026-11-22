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
    await setDoc(doc(db,"genderMembers","male"),{
      gender:"male",totalMembers:1,updatedAt:new Date()
    });
    await setDoc(doc(db,"invitations","abc123"),{
      byUid:ownerId,used:false,revoked:false,createdAt:new Date()
    });
  });
  const guestDb=env.unauthenticatedContext().firestore();
  const ownerDb=env.authenticatedContext(ownerId,{owner:true}).firestore();
  const newDb=env.authenticatedContext(newId,{auth_time:1700000000}).firestore();
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
    const maleCountRef=doc(newDb,"genderMembers","male");
    const maleCount=await tx.get(maleCountRef);
    const seq=await tx.get(seqRef);
    const invite=await tx.get(invitation);
    const existing=await tx.get(usernameRef);
    const own=await tx.get(memberRef);
    if(!seq.exists()||!invite.exists()||existing.exists()||own.exists())
      throw Error("Invalid seeded signup state");
    tx.update(seqRef,{lastNumber:2,lastMemberUid:newId,updatedAt:serverTimestamp()});
    tx.update(invitation,{used:true,usedByUid:newId,usedAt:serverTimestamp()});
    tx.set(usernameRef,{uid:newId,createdAt:serverTimestamp()});
    tx.set(maleCountRef,{
      gender:"male",totalMembers:maleCount.get("totalMembers")+1,
      updatedAt:serverTimestamp()
    });
    tx.set(memberRef,{
      uid:newId,username:"member2",name:"New Member",role:"member",gender:"male",memberNumber:2,
      serial:"DI-2",inviterUid:ownerId,inviteCode:"abc123",disabled:false,
      pledgeAcceptedAt:serverTimestamp(),createdAt:serverTimestamp()
    });
  }));
  await assertSucceeds(setDoc(doc(newDb,"activeLogins",newId),{
    authTime:1700000000,sessionId:"test-device-member-two",claimedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(newDb,"members",newId),{role:"owner"}));
  // Another valid password sign-in must NOT replace the first active session.
  // Once the first device explicitly logs out, the second may claim it.
  const newPhone=env.authenticatedContext(newId,{auth_time:1700000001}).firestore();
  await assertFails(getDoc(doc(newPhone,"memberPrivate",newId,"prayers","2026-11-22")));
  await assertFails(setDoc(doc(newPhone,"activeLogins",newId),{
    authTime:1700000001,sessionId:"different-browser-session",claimedAt:serverTimestamp()
  }));
  // Original device retains full access after the rejected attempt.
  await assertSucceeds(getDoc(doc(newDb,"members",newId)));
  await assertSucceeds(getDoc(doc(newDb,"activeLogins",newId)));
  await assertSucceeds(getDoc(doc(newDb,"memberPrivate",newId,"prayers","2026-11-22")));
  await assertSucceeds((async()=>{
    const r=doc(newDb,"activeLogins",newId);
    const {deleteDoc}=require("firebase/firestore");
    return deleteDoc(r);
  })());
  await assertSucceeds(setDoc(doc(newPhone,"activeLogins",newId),{
    authTime:1700000001,sessionId:"different-browser-session",claimedAt:serverTimestamp()
  }));
  await assertFails(getDoc(doc(newDb,"memberPrivate",newId,"prayers","2026-11-22")));
  // Restore original lease for the rest of the historic tests.
  await assertSucceeds((async()=>{
    const {deleteDoc}=require("firebase/firestore");
    return deleteDoc(doc(newPhone,"activeLogins",newId));
  })());
  await assertSucceeds(setDoc(doc(newDb,"activeLogins",newId),{
    authTime:1700000000,sessionId:"test-device-member-two",claimedAt:serverTimestamp()
  }));
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
    const sideRef=doc(newDb,"genderStats","male");
    const personal=await tx.get(countRef);
    const global=await tx.get(globalRef);
    const side=await tx.get(sideRef);
    const amount=10;
    tx.set(countRef,{memberUid:newId,gender:"male",total:(personal.exists()?personal.data().total:0)+amount,
      lastEntryAmount:amount,updatedAt:serverTimestamp()});
    tx.set(globalRef,{totalRecitations:(global.exists()?global.data().totalRecitations:0)+amount,
      lastEntryUid:newId,lastEntryAmount:amount,updatedAt:serverTimestamp()});
    tx.set(sideRef,{gender:"male",
      totalRecitations:(side.exists()?side.data().totalRecitations:0)+amount,
      lastEntryUid:newId,lastEntryAmount:amount,updatedAt:serverTimestamp()});
  }));
  await assertFails(updateDoc(doc(newDb,"memberCounts",newId),{total:1000000}));
  await assertFails(updateDoc(doc(newDb,"publicStats","global"),{totalRecitations:1000000}));
  // A woman cannot read male private data or use a male member's invite.
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,"members","woman-uid"),{
      uid:"woman-uid",username:"woman",name:"Female Member",role:"member",
      gender:"female",serial:"DI-3",memberNumber:3,disabled:false,inviterUid:ownerId
    });
    await setDoc(doc(admin,"activeLogins","woman-uid"),{
      authTime:1700000030,sessionId:"device-for-woman-01",claimedAt:new Date()
    });
    await setDoc(doc(admin,"invitations","male01"),{
      byUid:newId,gender:"male",used:false,revoked:false,createdAt:new Date()
    });
  });
  const femaleDb=env.authenticatedContext("woman-uid",{auth_time:1700000030}).firestore();
  await assertSucceeds(getDoc(doc(femaleDb,"members","woman-uid")));
  await assertFails(getDoc(doc(femaleDb,"members",newId)));
  await assertFails(getDoc(doc(newDb,"members","woman-uid")));
  await assertFails(getDoc(doc(femaleDb,"memberCounts",newId)));
  await assertFails(getDoc(doc(femaleDb,"genderStats","male")));
  await assertFails(getDoc(doc(femaleDb,"genderMembers","male")));
  await assertSucceeds(getDoc(doc(newDb,"genderStats","male")));
  await assertSucceeds(getDoc(doc(ownerDb,"genderStats","male")));
  await assertSucceeds(getDoc(doc(ownerDb,"genderMembers","male")));
  await assertSucceeds(setDoc(doc(femaleDb,"groupChats","female","messages","f1"),{
    gender:"female",senderUid:"woman-uid",senderName:"Female Member",
    body:"Female group message",createdAt:serverTimestamp()
  }));
  await assertFails(getDoc(doc(newDb,"groupChats","female","messages","f1")));
  await assertFails(getDoc(doc(femaleDb,"groupChats","male","messages","m1")));
  await assertSucceeds(getDoc(doc(ownerDb,"groupChats","female","messages","f1")));
  await assertFails(setDoc(doc(femaleDb,"groupChats","male","messages","attack"),{
    gender:"male",senderUid:"woman-uid",senderName:"Female Member",
    body:"Wrong side",createdAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(femaleDb,"groupChats","female","messages","spoof"),{
    gender:"female",senderUid:"woman-uid",senderName:"Owner",
    body:"Spoof",createdAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb,"members",newId),{
    disabled:true,deleted:true,updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb,"members",newId),{
    disabled:false,deleted:false,updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(newDb,"members",newId),{gender:"female"}));
  await assertSucceeds(setDoc(doc(femaleDb,"invitations","fem123"),{
    byUid:"woman-uid",gender:"female",used:false,revoked:false,createdAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(femaleDb,"invitations","wrong1"),{
    byUid:"woman-uid",gender:"male",used:false,revoked:false,createdAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb,"members",newId),{disabled:true,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(newDb,"memberCounts",newId)));
  // Authorized owner self-repair: DI-1 is profile data, never a login ID.
  // A guessed email alone cannot grant owner rights; trusted UID or an Admin
  // custom claim is required in the published Firestore security rules.
  await env.clearFirestore();
  const legacyId="vt06NK7DcmgPpUKD4R7EgwzAxIH3";
  const deletedOwnerId="ecrykLlmTAbV90llOdQVRSX4OyE3";
  const legacyDb=env.authenticatedContext(legacyId).firestore();
  const maliciousDb=env.authenticatedContext("random-email-user").firestore();
  const profile=uid=>({
    uid,username:"owner",name:"Original owner",role:"owner",
    serial:"DI-1",memberNumber:1,disabled:false,inviterUid:null,
    createdAt:serverTimestamp()
  });
  await assertFails(setDoc(doc(maliciousDb,"members","random-email-user"),
    profile("random-email-user")));
  await assertFails(setDoc(doc(maliciousDb,"system","membership"),
    {ownerUid:"random-email-user",lastNumber:1,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(legacyDb,"members",legacyId),profile(legacyId)));
  await assertFails(setDoc(doc(legacyDb,"system","membership"),
    {ownerUid:legacyId,lastNumber:1,updatedAt:serverTimestamp()}));
  await assertSucceeds(runTransaction(legacyDb,async tx=>{
    const seqRef=doc(legacyDb,"system","membership");
    const ownerRef=doc(legacyDb,"members",legacyId);
    const seq=await tx.get(seqRef),owner=await tx.get(ownerRef);
    if(seq.exists()||owner.exists())throw Error("expected empty owner records");
    tx.set(seqRef,{ownerUid:legacyId,lastNumber:1,updatedAt:serverTimestamp()});
    tx.set(ownerRef,profile(legacyId));
  }));
  const first=await getDoc(doc(legacyDb,"members",legacyId));
  if(!first.exists()||first.data().serial!=="DI-1")throw Error("missing DI-1 profile");
  await assertFails(updateDoc(doc(legacyDb,"system","membership"),{lastNumber:1}));
  // Restoring a missing owner profile must preserve an existing sequence.
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"system","membership"),
      {ownerUid:legacyId,lastNumber:17,updatedAt:new Date()});
  });
  await assertSucceeds(setDoc(doc(legacyDb,"members",legacyId),profile(legacyId)));
  const preserved=await getDoc(doc(legacyDb,"system","membership"));
  if(preserved.data().lastNumber!==17)throw Error("member counter was reset");
  // Repair a deleted TEST Owner: transfer only the abandoned sequence to the
  // new verified Auth UID and keep the last issued serial intact.
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"system","membership"),{
      ownerUid:deletedOwnerId,lastNumber:17,updatedAt:new Date()
    });
  });
  await assertSucceeds(runTransaction(legacyDb,async tx=>{
    const seqRef=doc(legacyDb,"system","membership");
    const ownRef=doc(legacyDb,"members",legacyId);
    const [seq,own]=await Promise.all([tx.get(seqRef),tx.get(ownRef)]);
    if(!seq.exists()||own.exists()||seq.get("ownerUid")!==deletedOwnerId)
      throw Error("bad test-owner migration seed");
    tx.update(seqRef,{ownerUid:legacyId,updatedAt:serverTimestamp()});
    tx.set(ownRef,profile(legacyId));
  }));
  const transferred=await getDoc(doc(legacyDb,"system","membership"));
  if(transferred.get("ownerUid")!==legacyId||transferred.get("lastNumber")!==17)
    throw Error("test owner transfer failed or reused serial numbers");
  const removedAccountDb=env.authenticatedContext(deletedOwnerId).firestore();
  await assertFails(setDoc(doc(removedAccountDb,"members",deletedOwnerId),profile(deletedOwnerId)));
  await assertFails(updateDoc(doc(removedAccountDb,"system","membership"),{lastNumber:1}));
  console.log("Spark security tests passed: gender counters, invitation, session, private prayer, side totals, chat isolation, safe removal and restoration.");
 }finally{await env.cleanup();}
})().catch(err=>{console.error(err);process.exitCode=1;});
