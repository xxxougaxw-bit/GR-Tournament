import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ Firebaseコンソール → プロジェクト設定 → アプリ → CDN からコピーして貼り付けてください
const firebaseConfig = {
  apiKey: "AIzaSyDqtq2uFoMy83YyeeE5TvLeqXs_xXk3WB8",
  authDomain: "tournament-72a30.firebaseapp.com",
  projectId: "tournament-72a30",
  storageBucket: "tournament-72a30.firebasestorage.app",
  messagingSenderId: "469832611656",
  appId: "1:469832611656:web:0d8611b3aeffc529a2a57d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
