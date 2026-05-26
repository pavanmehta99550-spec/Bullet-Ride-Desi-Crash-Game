import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

async function testClientOnServer() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  console.log("Testing Client SDK on Server with API Key...");

  const firebaseConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  };

  try {
    const app = initializeApp(firebaseConfig, 'client-on-server');
    const db = getFirestore(app, config.firestoreDatabaseId); // Database ID as 2nd arg? No, client side is different
    // Client side getFirestore(app, databaseId) works.
    
    console.log("Attempting write via client SDK...");
    await setDoc(doc(db, 'test', 'client_doc'), { time: Date.now() });
    console.log("SUCCESS via client SDK!");
  } catch (e: any) {
    console.log("FAILED via client SDK:", e.message);
  }
}
testClientOnServer();
