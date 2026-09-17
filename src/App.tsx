import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import TelegramSDK from '@twa-dev/sdk';

const firebaseConfig = {
  apiKey: "AIzaSyBWqfdWvvsy78yvNfLFsvbsMh6XjYrG2-k",
  authDomain: "bearfarm-47ec7.firebaseapp.com",
  projectId: "bearfarm-47ec7",
  storageBucket: "bearfarm-47ec7.firebasestorage.app",
  messagingSenderId: "377024316625",
  appId: "1:377024316625:web:0b5b52eb9d26b96e33b1f0",
  measurementId: "G-NLQEVSFLR9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

export default function BearFarmApp() {
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState<'home' | 'tasks' | 'ads' | 'refer' | 'profile'>('home');

  useEffect(() => {
    TelegramSDK.ready();
    TelegramSDK.expand();

    const initData = TelegramSDK.initData;
    const authFn = httpsCallable(functions, 'authenticateTelegramUser');

    authFn({ initData })
      .then((res: any) => {
        return signInWithCustomToken(auth, res.data.token);
      })
      .then((userCred) => {
        setUser(TelegramSDK.initDataUnsafe.user);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setNetworkError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-amber-950 text-amber-100 p-4">
        <div className="w-24 h-24 mb-4 rounded-full border-4 border-amber-500 animate-pulse flex items-center justify-center text-4xl shadow-lg bg-amber-900">
          🐻🌾
        </div>
        <h2 className="text-xl font-bold">Bear Farm Loading...</h2>
        <div className="mt-4 w-48 bg-amber-900 h-2 rounded-full overflow-hidden">
          <div className="bg-amber-400 h-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  if (networkError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-950 text-white p-6 text-center">
        <span className="text-5xl mb-3">⚠️</span>
        <h2 className="text-xl font-bold mb-2">Network Error</h2>
        <p className="text-sm opacity-80 mb-4">Failed to authenticate with Telegram. Please check your internet connection.</p>
        <button onClick={() => window.location.reload()} className="bg-amber-500 text-black px-6 py-2 rounded-xl font-bold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-950 via-stone-900 to-black text-amber-50 pb-20 select-none">
      {/* Header Profile Section */}
      <div className="p-4 flex items-center justify-between border-b border-amber-900/40 bg-amber-950/50 backdrop-blur">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-amber-700 flex items-center justify-center text-lg font-bold">
            {user?.first_name?.charAt(0) || '🐻'}
          </div>
          <div>
            <p className="text-xs text-amber-400/80">Farmer</p>
            <p className="font-bold text-sm">@{user?.username || user?.first_name}</p>
          </div>
        </div>
        <div className="bg-amber-900/60 border border-amber-500/30 px-3 py-1 rounded-full text-xs flex items-center space-x-1">
          <span>🌾</span>
          <span className="font-semibold text-amber-300">BEAR Token</span>
        </div>
      </div>

      {/* Main Content Render */}
      <main className="p-4">
        {activeTab === 'home' && <HomeView balance={balance} />}
        {activeTab === 'tasks' && <TasksView />}
        {activeTab === 'ads' && <AdsView />}
        {activeTab === 'refer' && <ReferView userId={user?.id} />}
        {activeTab === 'profile' && <ProfileView user={user} balance={balance} />}
      </main>

      {/* Quality UI Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-amber-900/50 flex justify-around p-2 text-xs">
        <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="🌾" label="Farm" />
        <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon="📋" label="Tasks" />
        <NavButton active={activeTab === 'ads'} onClick={() => setActiveTab('ads')} icon="📺" label="Ads" highlighted />
        <NavButton active={activeTab === 'refer'} onClick={() => setActiveTab('refer')} icon="👥" label="Friends" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon="⚙️" label="Profile" />
      </nav>
    </div>
  );
}

function HomeView({ balance }: { balance: number }) {
  const [mining, setMining] = useState(false);

  const handleMining = async () => {
    const claimFn = httpsCallable(functions, 'claimMiningReward');
    try {
      const res: any = await claimFn();
      alert(res.data.message || 'Mining Updated!');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Balance Card Frame */}
      <div className="p-6 bg-gradient-to-r from-amber-900/60 to-amber-950/80 border-2 border-amber-500/40 rounded-2xl text-center shadow-xl">
        <p className="text-xs text-amber-300 uppercase tracking-widest font-semibold mb-1">Total Balance</p>
        <h1 className="text-4xl font-extrabold text-amber-400 drop-shadow-md">{balance.toLocaleString()} 🌾</h1>
      </div>

      {/* Mining Widget */}
      <div className="p-5 bg-stone-900 border border-amber-900/50 rounded-2xl flex flex-col items-center">
        <div className="w-20 h-20 bg-amber-900/30 rounded-full flex items-center justify-center text-4xl mb-3 border border-amber-500/20">
          🐻
        </div>
        <h3 className="font-bold text-lg mb-1">Hourly Bear Mining</h3>
        <p className="text-xs text-stone-400 mb-4">Earn 100 Tokens / Hour</p>
        
        <button
          onClick={handleMining}
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold rounded-xl shadow-lg active:scale-95 transition-transform"
        >
          {mining ? 'Claim 100 Tokens' : 'Start Mining (1h)'}
        </button>
      </div>

      {/* Quick Links & Reward Codes */}
      <div className="grid grid-cols-2 gap-3">
        <a href="https://t.me/bearfarmCommunity" target="_blank" className="p-3 bg-stone-900 border border-stone-800 rounded-xl text-center text-xs font-semibold">
          📢 Community Channel
        </a>
        <a href="https://t.me/bearfarm_pay_out" target="_blank" className="p-3 bg-stone-900 border border-stone-800 rounded-xl text-center text-xs font-semibold">
          💳 Payment Channel
        </a>
      </div>
    </div>
  );
}

function TasksView() { return <div className="text-center p-8">Task Hub (Daily, Telegram & Partner Tasks)</div>; }
function AdsView() { return <div className="text-center p-8 text-amber-400 font-bold text-lg">📺 Watch Ads & Visit Sites (Adsgram Integrated)</div>; }
function ReferView({ userId }: { userId: string }) {
  const link = `https://t.me/Bear_Farmbot/earn?start=${userId}`;
  return (
    <div className="p-4 space-y-3">
      <h2 className="font-bold text-lg">Referral Dashboard</h2>
      <input readOnly value={link} className="w-full p-2 bg-stone-950 border border-amber-900/60 rounded text-xs text-amber-300" />
    </div>
  );
}
function ProfileView({ user, balance }: { user: any, balance: number }) {
  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-lg">User Profile</h2>
      <p className="text-xs">ID: {user?.id}</p>
      <p className="text-xs">Wallet: USDT (BEP-20)</p>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, highlighted = false }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-1 px-3 rounded-xl transition-colors ${
        active ? 'text-amber-400 font-bold' : 'text-stone-400'
      } ${highlighted ? 'scale-110 bg-amber-900/40 border border-amber-500/30' : ''}`}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
