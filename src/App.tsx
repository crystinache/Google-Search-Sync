/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  deleteDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { Search, Mic, Menu, Grid, Info, Sparkles, CircleUser, TrendingUp, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { getMostImportantWork, getSearchSuggestions } from './services/aiService';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export default function App() {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingData, setPendingData] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [appMode, setAppMode] = useState<'mirror' | 'ai' | 'typing' | 'blackScreenPeek'>(() => {
    return (localStorage.getItem('appMode') as 'mirror' | 'ai' | 'typing' | 'blackScreenPeek') || 'mirror';
  });
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [searchType, setSearchType] = useState<'web' | 'images'>(() => {
    return (localStorage.getItem('searchType') as 'web' | 'images') || 'web';
  });
  const [siteMode, setSiteMode] = useState<'google' | 'wikipedia'>(() => {
    return (localStorage.getItem('siteMode') as 'google' | 'wikipedia') || 'google';
  });

  const [magnumOpusInput, setMagnumOpusInput] = useState('');
  const [magnumOpusOutput, setMagnumOpusOutput] = useState('');
  const [isTestLoading, setIsTestLoading] = useState(false);

  const handleTestMagnumOpus = async () => {
    if (!magnumOpusInput.trim()) return;
    setIsTestLoading(true);
    try {
      const result = await getMostImportantWork(magnumOpusInput, lang);
      setMagnumOpusOutput(result);
    } catch (err) {
      setMagnumOpusOutput("Errore");
    } finally {
      setIsTestLoading(false);
    }
  };

  const [lang, setLang] = useState<'it' | 'ro' | 'en'>(() => {
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('it')) return 'it';
    if (navLang.startsWith('ro')) return 'ro';
    return 'en';
  });

  const translations = {
    it: {
      all: "TUTTI",
      images: "IMMAGINI",
      footerImages: "Immagini",
      darkMode: "Tema scuro",
      privacy: "Privacy",
      terms: "Termini",
      trending: "Ricerche di tendenza",
      readInYourLang: "Leggi Wikipedia nella tua lingua",
      langCode: "IT",
      articles: "voci",
      search: "Cerca",
      settings: "Impostazioni"
    },
    ro: {
      all: "TOATE",
      images: "IMAGINI",
      footerImages: "Imagini",
      darkMode: "Temă întunecată",
      privacy: "Confidențialitate",
      terms: "Termeni",
      trending: "Căutări în tendințe",
      readInYourLang: "Citiți Wikipedia în limba dumneavoastră",
      langCode: "RO",
      articles: "articole",
      search: "Căutare",
      settings: "Setări"
    },
    en: {
      all: "ALL",
      images: "IMAGES",
      footerImages: "Images",
      darkMode: "Dark theme",
      privacy: "Privacy",
      terms: "Terms",
      trending: "Trending searches",
      readInYourLang: "Read Wikipedia in your language",
      langCode: "EN",
      articles: "articles",
      search: "Search",
      settings: "Settings"
    }
  };

  const t = (key: keyof typeof translations['it']) => translations[lang][key] || translations['en'][key];
  
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);

  // Helper for date-based terms in multiple languages
  const getDynamicTerms = (currentLang: 'it' | 'ro' | 'en') => {
    const now = new Date();
    const monthsIT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const monthsRO = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
    const monthsEN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const year = now.getFullYear();
    const monthIT = monthsIT[now.getMonth()];
    const monthRO = monthsRO[now.getMonth()];
    const monthEN = monthsEN[now.getMonth()];

    if (currentLang === 'ro') {
      return [
        `meteo ${monthRO} ${year}`,
        "dosar pensionare",
        "gazeta sporturilor",
        `alocatia copii ${year}`,
        "clasament superliga",
        "reteta rapida de tiramisu",
        "extragere loto 6 din 49",
        `finala champions league ${year}`,
        "zboruri low cost",
        "oferte smartphone"
      ].sort(() => Math.random() - 0.5);
    } else if (currentLang === 'en') {
      return [
        `weather forecast ${monthEN} ${year}`,
        "cheap flights",
        "premier league standings",
        "iphone deals",
        "lottery results today",
        `champions league final ${year}`,
        "quick tiramisu recipe",
        "restaurants near me",
        "social security benefits",
        `electricity and gas prices ${year}`
      ].sort(() => Math.random() - 0.5);
    } else {
      return [
        `previsioni meteo ${monthIT} ${year}`,
        "carta d'identità elettronica",
        "classifica serie A",
        "estrazione superenalotto oggi",
        "voli economici",
        "finale champions league",
        "offerta iphone",
        "ricetta tiramisù veloce",
        "ristoranti vicino a me",
        `pun luce e psv gas ${year}`
      ].sort(() => Math.random() - 0.5);
    }
  };

  useEffect(() => {
    setTrendingSearches(getDynamicTerms(lang));
  }, [lang]);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('isDarkMode') === 'true';
  });
  
  // Deleted Words logic states
  const [localDeletedWords, setLocalDeletedWords] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('localDeletedWords');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((w: any) => typeof w === 'string' && w.trim() !== '') : [];
    } catch (e) {
      return [];
    }
  });
  const candidateRef = useRef<string | null>(null);
  const candidateTimerRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('localDeletedWords', JSON.stringify(localDeletedWords));
  }, [localDeletedWords]);

  // Black Screen Peek States
  const [peekBrightness, setPeekBrightness] = useState(255); // 255 = White, 0 = Black
  const [isPeekStarted, setIsPeekStarted] = useState(false);
  const [peekResult, setPeekResult] = useState<{ query: string; deletedWords?: string[] } | null>(null);
  const [isTapToShowEnabled, setIsTapToShowEnabled] = useState(false);
  const [isPeekVisibleManually, setIsPeekVisibleManually] = useState(false);
  const [isPeekLocked, setIsPeekLocked] = useState(false);
  const [isDeletedWordToggleOn, setIsDeletedWordToggleOn] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('appMode', appMode);
    // Reset peek states when changing mode
    if (appMode !== 'blackScreenPeek') {
      setIsPeekStarted(false);
      setPeekResult(null);
      setIsPeekVisibleManually(false);
      setIsPeekLocked(false);
    }
  }, [appMode]);

  useEffect(() => {
    localStorage.setItem('searchType', searchType);
  }, [searchType]);

  useEffect(() => {
    localStorage.setItem('siteMode', siteMode);
  }, [siteMode]);

  useEffect(() => {
    localStorage.setItem('isDarkMode', String(isDarkMode));
  }, [isDarkMode]);

  // Deleted Words Logic
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery && trimmedQuery.length > 0) {
      if (candidateTimerRef.current) clearTimeout(candidateTimerRef.current);
      
      // Settled for 1s
      candidateTimerRef.current = setTimeout(() => {
        candidateRef.current = trimmedQuery;
      }, 1000);
    } else {
      // Input is empty or just whitespace
      if (candidateTimerRef.current) clearTimeout(candidateTimerRef.current);
      
      if (candidateRef.current && candidateRef.current.trim() !== '') {
        // Only add if it's not already the last deleted word (avoid duplicates)
        const wordToAdd = candidateRef.current.trim();
        setLocalDeletedWords(prev => {
          if (prev.length > 0 && prev[prev.length - 1] === wordToAdd) {
            return prev;
          }
          return [...prev, wordToAdd];
        });
        candidateRef.current = null;
      }
    }
  }, [query]);
  
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(lock);
        setIsWakeLockActive(true);
        
        lock.addEventListener('release', () => {
          setWakeLock(null);
          setIsWakeLockActive(false);
        });
      } catch (err: any) {
        // Silently fail if permissions policy prevents wake lock (common in iframes)
        if (err.name !== 'NotAllowedError') {
          console.warn(`WakeLock failed: ${err.name}, ${err.message}`);
        }
      }
    }
  };

  useEffect(() => {
    const handleInteraction = () => {
      requestWakeLock();
    };

    document.addEventListener('mousedown', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [wakeLock]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastRedirectId = useRef<string | null>(null);
  const lastHandledSyncId = useRef<string | null>(null);
  const isInitialSnapshot = useRef(true);

  const appId = "google-search-simulator"; 
  const SHARED_DOC_PATH = `artifacts/${appId}/public/data/shared_search/latest_query`;
  const TYPING_DOC_PATH = `artifacts/${appId}/public/data/shared_search/typing`;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'auth');
          setSyncMessage({ text: `Auth Error: ${error instanceof Error ? error.message : String(error)}`, isError: true });
        }
      }
      setIsAuthReady(true);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length >= 2) {
        const userLang = navigator.language || 'it';
        const results = await getSearchSuggestions(query, userLang);
        setSuggestions(results);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const handleDataChange = (data: any) => {
      if (data) {
        const isFromMe = data.userId === user.uid;
        const isNew = data.uniqueId !== lastHandledSyncId.current;
        
        setPendingData(data);
        
        if (!isFromMe && isNew) {
          lastHandledSyncId.current = data.uniqueId;
          // Esecuzione immediata senza messaggi visivi per massima fluidità
          autoExecuteRemoteQuery(data);
        }
      } else {
        setPendingData(null);
        setSyncMessage(null);
      }
    };

    // Real Firebase
    const sharedDocRef = doc(db, SHARED_DOC_PATH);
    const unsubscribe = onSnapshot(sharedDocRef, (docSnapshot) => {
      handleDataChange(docSnapshot.exists() ? docSnapshot.data() : null);
    }, (error) => {
      const errInfo = handleFirestoreError(error, OperationType.GET, SHARED_DOC_PATH);
      setSyncMessage({ 
        text: `Errore Firestore: ${error.message}. Verifica di aver aggiunto il dominio di Vercel su Firebase Console.`, 
        isError: true 
      });
    });
    // 2. Real-time Typing listener
    const typingDocRef = doc(db, TYPING_DOC_PATH);
    const unsubscribeTyping = onSnapshot(typingDocRef, (docSnapshot) => {
      if (appMode === 'typing' && docSnapshot.exists()) {
        const typingData = docSnapshot.data();
        if (typingData.userId !== user.uid) {
          setQuery(typingData.text);
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTyping();
    };
  }, [isAuthReady, user, appMode, searchType]);

  const emitTyping = async (text: string) => {
    if (!isAuthReady || !user) return;
    try {
      await setDoc(doc(db, TYPING_DOC_PATH), {
        text,
        userId: user.uid,
        timestamp: Date.now()
      });
    } catch (e) {
      // Silent error for typing
    }
  };

  const handleSearch = async (queryToUse?: string) => {
    const currentQueryText = (queryToUse || query).trim();
    if (!currentQueryText) return;

    // 1. Determine local URL based on siteMode
    const encodedQuery = encodeURIComponent(currentQueryText);
    let localUrl = '';
    
    if (siteMode === 'wikipedia') {
      localUrl = `https://${lang}.wikipedia.org/wiki/${encodedQuery}`;
    } else {
      const googleDomain = lang === 'it' ? 'it' : (lang === 'ro' ? 'ro' : 'com');
      localUrl = searchType === 'images' 
        ? `https://www.google.${googleDomain}/search?q=${encodedQuery}&tbm=isch` 
        : `https://www.google.${googleDomain}/search?q=${encodedQuery}`;
    }
    
    // 2. Perform database write silently in the background
    if (isAuthReady && user) {
      try {
        const processSearch = async () => {
          const newRedirectId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
          let savedDeletedWords: string[] = [];
          try {
            const raw = localStorage.getItem('localDeletedWords');
            savedDeletedWords = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(savedDeletedWords)) savedDeletedWords = [];
            savedDeletedWords = savedDeletedWords.filter(w => typeof w === 'string' && w.trim() !== '');
          } catch (e) {}
          
          const data = {
            query: currentQueryText,
            timestamp: Date.now(),
            userId: user.uid,
            uniqueId: newRedirectId,
            searchType: searchType,
            site: siteMode,
            deletedWords: savedDeletedWords
          };

          await setDoc(doc(db, SHARED_DOC_PATH), data);
          setLocalDeletedWords([]); // Clear state
          localStorage.removeItem('localDeletedWords'); // Clear storage
          candidateRef.current = null; 
        };

        await processSearch();
      } catch (e) {
        // Just log, don't block redirect
        console.error("Firestore sync failed", e);
      }
    }
    
    // Always navigate
    window.location.replace(localUrl);
  };

  // Auto execution logic via Direct Double-Device Redirect
  const autoExecuteRemoteQuery = async (data: any) => {
    const { query: rawQuery } = data;
    
    // RECEIVER APPLIES THEIR OWN LOCAL MODES
    let finalQuery = rawQuery;
    
    if (appMode === 'ai') {
      const userLang = navigator.language || 'it';
      finalQuery = await getMostImportantWork(rawQuery, userLang);
    }

    if (appMode === 'blackScreenPeek') {
      setPeekResult({
        query: finalQuery,
        deletedWords: data.deletedWords
      });
      // Clean up from DB
      try {
        await deleteDoc(doc(db, SHARED_DOC_PATH));
      } catch (e) {
        console.error("Cleanup error:", e);
      }
      return; // Stop here, no redirect
    }
    
    const encodedFinalQuery = encodeURIComponent(finalQuery);
    
    // RECEIVER USES THEIR OWN LOCAL SITE MODE AND SEARCH TYPE
    let localUrl = '';
    if (siteMode === 'wikipedia') {
      localUrl = `https://${lang}.wikipedia.org/wiki/${encodedFinalQuery}`;
    } else {
      const googleDomain = lang === 'it' ? 'it' : (lang === 'ro' ? 'ro' : 'com');
      localUrl = searchType === 'images'
        ? `https://www.google.${googleDomain}/search?q=${encodedFinalQuery}&tbm=isch`
        : `https://www.google.${googleDomain}/search?q=${encodedFinalQuery}`;
    }
    
    // Redirect current page immediately
    window.location.replace(localUrl);
    
    // Clean up from DB
    try {
      await deleteDoc(doc(db, SHARED_DOC_PATH));
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  };

  if (siteMode === 'wikipedia') {
    return (
      <div className="bg-white min-h-screen flex flex-col font-sans antialiased text-gray-900">
        <header className="pt-10 pb-6 flex flex-col items-center">
          <div className="flex flex-col items-center text-center px-4">
            <div className="flex items-center">
              <img 
                src="https://i.imgur.com/pDq2xEx.png" 
                alt="Wikipedia" 
                className="w-14 h-14 mr-1 object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col items-center">
                <div className="flex items-baseline font-serif tracking-[0.10em] text-gray-900">
                  <span className="text-4xl leading-none">W</span>
                  <span className="text-2xl leading-none">IKIPEDI</span>
                  <span className="text-4xl leading-none">A</span>
                </div>
                <div className="text-[10px] italic text-gray-600 mt-1 tracking-widest uppercase">The Free Encyclopedia</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center px-4">
          <div className="w-full max-w-xl flex items-stretch h-10 border border-gray-400 rounded-sm overflow-hidden focus-within:border-blue-500 shadow-sm">
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch(query);
              }}
              className="flex-grow px-3 outline-none text-base"
            />
            <div className="flex items-center px-2 border-l border-gray-300 bg-gray-50 text-gray-600 text-sm cursor-pointer hover:bg-gray-100">
              {t('langCode')} <span className="ml-1 text-[10px]">▼</span>
            </div>
            <button 
              onClick={() => handleSearch(query)}
              className="bg-[#36c] hover:bg-[#447ff5] px-4 flex items-center justify-center transition-colors"
            >
              <Search className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-x-12 gap-y-6 text-center max-w-2xl px-4">
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Italiano</span>
              <span className="text-xs text-gray-500">1.800.000+ {t('articles')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">English</span>
              <span className="text-xs text-gray-500">6.000.000+ {t('articles')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Română</span>
              <span className="text-xs text-gray-500">400.000+ {t('articles')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Deutsch</span>
              <span className="text-xs text-gray-500">2.800.000+ Artikel</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Français</span>
              <span className="text-xs text-gray-500">2.500.000+ articles</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Español</span>
              <span className="text-xs text-gray-500">1.800.000+ artículos</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Русский</span>
              <span className="text-xs text-gray-500">2.000.000+ статей</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Slovenščina</span>
              <span className="text-xs text-gray-500">180.000+ člankov</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 font-medium hover:underline cursor-pointer">Nederlands</span>
              <span className="text-xs text-gray-500">2.100.000+ artikelen</span>
            </div>
          </div>

          <div className="mt-10 w-full max-w-xl border border-gray-300 p-2 text-center text-blue-700 font-medium hover:bg-gray-50 cursor-pointer rounded">
             {t('readInYourLang')} <span className="text-xs">▼</span>
          </div>

          <div className="mt-4 mb-12 w-full max-w-xl grid grid-cols-2 gap-x-12 text-sm text-blue-700 px-4">
            <div className="flex flex-col space-y-1.5 items-start">
              <span className="hover:underline cursor-pointer">Polski</span>
              <span className="hover:underline cursor-pointer">Português</span>
              <span className="hover:underline cursor-pointer">Русский</span>
              <span className="hover:underline cursor-pointer">日本語</span>
              <span className="hover:underline cursor-pointer">中文</span>
              <span className="hover:underline cursor-pointer">Tiếng Việt</span>
              <span className="hover:underline cursor-pointer">Svenska</span>
              <span className="hover:underline cursor-pointer">Nederlands</span>
              <span className="hover:underline cursor-pointer">한국어</span>
              <span className="hover:underline cursor-pointer">Català</span>
              <span className="hover:underline cursor-pointer">العربية</span>
            </div>
            <div className="flex flex-col space-y-1.5 items-start">
              <span className="hover:underline cursor-pointer">Norsk (Bokmål)</span>
              <span className="hover:underline cursor-pointer">Suomi</span>
              <span className="hover:underline cursor-pointer">Magyar</span>
              <span className="hover:underline cursor-pointer">Čeština</span>
              <span className="hover:underline cursor-pointer">Türkçe</span>
              <span className="hover:underline cursor-pointer">Română</span>
              <span className="hover:underline cursor-pointer">Simple English</span>
              <span className="hover:underline cursor-pointer">Esperanto</span>
              <span className="hover:underline cursor-pointer">Српски / Srpski</span>
              <span className="hover:underline cursor-pointer">Dansk</span>
              <span className="hover:underline cursor-pointer">עברית</span>
            </div>
          </div>
        </main>

        <footer className="w-full flex justify-center py-6 border-t border-gray-200">
          <div className="flex space-x-6 text-xs text-blue-700">
            <button 
              onDoubleClick={() => setSiteMode('google')}
              className="hover:underline focus:outline-none text-gray-600"
            >
              {t('privacy')}
            </button>
            <a href="#" className="hover:underline">{t('terms')}</a>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans antialiased overflow-x-hidden transition-colors duration-300 ${
      isDarkMode ? 'bg-[#202124] text-[#e8eaed]' : 'bg-white text-gray-900'
    }`}>
      {/* HEADER */}
      <AnimatePresence>
        {!isSearchActive && (
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`w-full max-w-[480px] mx-auto flex justify-between items-center px-3 py-3 border-b transition-colors duration-300 ${
              isDarkMode ? 'border-[#3c4043] bg-[#202124]' : 'border-gray-100 bg-white'
            }`}
          >
            <div className="flex items-center space-x-6">
              <div className="flex space-x-6">
                <button 
                  onClick={() => setSearchType('web')}
                  className={`text-xs font-medium border-b-2 transition-all pb-1 ${
                    isLoading 
                      ? 'border-transparent text-gray-400' 
                      : (searchType === 'web' 
                          ? (isDarkMode ? 'border-[#8ab4f8] text-[#8ab4f8]' : 'border-[#1a73e8] text-[#1a73e8]') 
                          : (isDarkMode ? 'border-transparent text-[#9aa0a6] hover:text-[#e8eaed]' : 'border-transparent text-gray-700 hover:text-gray-900')
                        )
                  }`}
                >
                  {t('all')}
                </button>
                <button 
                  onClick={() => setSearchType('images')}
                  className={`text-xs font-medium border-b-2 transition-all pb-1 ${
                    searchType === 'images' 
                      ? (isDarkMode ? 'border-[#8ab4f8] text-[#8ab4f8]' : 'border-[#1a73e8] text-[#1a73e8]') 
                      : (isDarkMode ? 'border-transparent text-[#9aa0a6] hover:text-[#e8eaed]' : 'border-transparent text-gray-700 hover:text-gray-900')
                  }`}
                >
                  {t('images')}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-5">
              <button className="p-1.5 rounded-full hover:bg-gray-100 transition duration-150 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-0.5 p-0.5">
                  {[...Array(9)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1 h-1 rounded-full transition-colors duration-500 ${
                        i === 4 && isWakeLockActive ? 'bg-black' : 'bg-gray-400'
                      }`} 
                    />
                  ))}
                </div>
              </button>
              <button 
                onDoubleClick={() => setShowSecretMenu(true)}
                className="w-8 h-8 rounded-full bg-[#1a73e8] hover:bg-blue-600 flex items-center justify-center transition duration-150 ease-in-out flex-shrink-0"
              >
                <CircleUser className="w-5 h-5 text-white" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main className="flex-grow flex flex-col items-center justify-start pt-12">
        <div className="w-full max-w-[480px] mx-auto flex flex-col items-center px-4">
          
          {/* LOGO */}
          <AnimatePresence>
            {!isSearchActive && (
              <motion.h1 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-[56px] font-semibold mb-8 select-none"
              >
                <span className="text-[#4285f4]">G</span>
                <span className="text-[#ea4335]">o</span>
                <span className="text-[#fbbc05]">o</span>
                <span className="text-[#4285f4]">g</span>
                <span className="text-[#34a853]">l</span>
                <span className="text-[#ea4335]">e</span>
              </motion.h1>
            )}
          </AnimatePresence>

          {/* SEARCH BOX */}
          <div 
            className={`w-full transition-all duration-300 ease-in-out ${
              isSearchActive 
                ? 'fixed top-0 left-0 right-0 z-50 bg-white py-3 px-0 max-w-none' 
                : 'relative max-w-md'
            } ${isDarkMode && isSearchActive ? '!bg-[#202124]' : ''}`}
          >
            <div 
              className={`flex items-center border transition-all duration-200 ${
                isSearchActive 
                  ? `border-b border-t-0 border-l-0 border-r-0 ${isDarkMode ? 'border-[#5f6368]' : 'border-gray-300'} rounded-none px-4 shadow-none` 
                  : `${isDarkMode ? 'border-[#5f6368] hover:bg-[#303134]' : 'border-gray-200 hover:shadow-md'} rounded-full px-4 shadow-sm`
              } h-11 transition-colors duration-300 ${isDarkMode ? 'bg-[#202124]' : 'bg-white'}`}
            >
              {isSearchActive ? (
                <ArrowLeft className="w-5 h-5 mr-3 flex-shrink-0 text-blue-600 cursor-pointer" onClick={() => setIsSearchActive(false)} />
              ) : (
                <Search className={`w-5 h-5 mr-3 flex-shrink-0 ${isDarkMode ? 'text-[#9aa0a6]' : 'text-gray-500'}`} />
              )}
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  emitTyping(val);
                }}
                onFocus={() => {
                  setIsSearchActive(true);
                  if (suggestions.length > 0) setShowSuggestions(true);
                  // Refresh trending searches on focus if empty
                  if (query.trim() === "") setTrendingSearches(getDynamicTerms(lang));
                }}
                onBlur={() => {
                  // Delay closing suggestions to allow clicking one
                  setTimeout(() => {
                    setIsSearchActive(false);
                    setShowSuggestions(false);
                  }, 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                    setShowSuggestions(false);
                  }
                }}
                className={`flex-grow text-lg outline-none bg-transparent h-full ${isDarkMode ? 'text-[#e8eaed] placeholder-[#9aa0a6]' : 'text-gray-900'}`}
              />
              {isSearchActive ? (
                <Search 
                  className={`w-5 h-5 ml-3 cursor-pointer flex-shrink-0 ${isDarkMode ? 'text-[#8ab4f8]' : 'text-gray-500'}`} 
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input onBlur from closing search before we can handle the search
                    if (query.trim() !== "") {
                      handleSearch(query);
                    }
                  }}
                />
              ) : (
                <Mic className={`w-5 h-5 ml-3 cursor-pointer flex-shrink-0 ${isDarkMode ? 'text-[#8ab4f8]' : 'text-gray-500'}`} />
              )}
            </div>

            {/* SUGGESTIONS / TRENDING DROPDOWN */}
            <AnimatePresence>
              {isSearchActive && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`absolute left-0 right-0 border-x border-b z-50 overflow-hidden transition-colors duration-300 ${
                    isDarkMode ? 'bg-[#202124] border-[#5f6368]' : 'bg-white border-gray-200'
                  } ${
                    isSearchActive ? 'top-full' : 'rounded-b-2xl mt-[-1px] shadow-lg'
                  }`}
                >
                  <div className="py-2">
                    {/* Standard Suggestions (from AI) */}
                    {query.trim() !== "" && suggestions.length > 0 && (
                      <>
                        {suggestions.map((suggestion, index) => (
                          <div
                            key={`sugg-${index}`}
                            className={`px-4 py-2.5 cursor-pointer flex items-center space-x-3 text-base font-semibold transition-colors ${
                              isDarkMode ? 'text-[#e8eaed] hover:bg-[#303134]' : 'text-gray-800 hover:bg-gray-100'
                            }`}
                            onClick={() => {
                              setQuery(suggestion);
                              emitTyping(suggestion);
                              setShowSuggestions(false);
                              setTimeout(() => handleSearch(suggestion), 100);
                            }}
                          >
                            <Search className={`w-4 h-4 ${isDarkMode ? 'text-[#9aa0a6]' : 'text-gray-400'}`} />
                            <span>{suggestion}</span>
                          </div>
                        ))}
                        <div className={`my-1 border-t ${isDarkMode ? 'border-[#3c4043]' : 'border-gray-100'}`} />
                      </>
                    )}

                    {/* Trending Searches - Always visible when active */}
                    <div className={`px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider ${isDarkMode ? 'text-[#9aa0a6]' : 'text-gray-500'}`}>
                      {t('trending')}
                    </div>
                    {trendingSearches.map((term, index) => (
                      <div
                        key={`trend-${index}`}
                        className={`px-4 py-2.5 cursor-pointer flex items-center space-x-3 text-base font-semibold transition-colors ${
                          isDarkMode ? 'text-[#e8eaed] hover:bg-[#303134]' : 'text-gray-800 hover:bg-gray-100'
                        }`}
                        onClick={() => {
                          setQuery(term);
                          emitTyping(term);
                          setShowSuggestions(false);
                          setTimeout(() => handleSearch(term), 100);
                        }}
                      >
                        <TrendingUp className={`w-4 h-4 ${isDarkMode ? 'text-[#9aa0a6]' : 'text-gray-400'}`} />
                        <span>{term}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <AnimatePresence>
        {!isSearchActive && (
          <motion.footer 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-0 left-0 right-0 w-full max-w-[480px] mx-auto p-4 border-t transition-colors duration-300 ${
              isDarkMode ? 'bg-[#171717] border-[#3c4043]' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className={`flex justify-center space-x-6 text-xs ${isDarkMode ? 'text-[#9aa0a6]' : 'text-gray-700'}`}>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="hover:underline focus:outline-none"
              >
                {t('darkMode')}
              </button>
              <a href="#" className="hover:underline">{t('footerImages')}</a>
              <button 
                onDoubleClick={() => setSiteMode(siteMode === 'wikipedia' ? 'google' : 'wikipedia')}
                className="hover:underline focus:outline-none"
              >
                {t('privacy')}
              </button>
              <a href="#" className="hover:underline">{t('terms')}</a>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* SECRET MENU */}
      <AnimatePresence>
        {showSecretMenu && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Menu Segreto
                </h2>
                <button 
                  onClick={() => setShowSecretMenu(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Grid className="w-5 h-5 text-gray-400 rotate-45" />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setAppMode('mirror');
                    setShowSecretMenu(false);
                  }}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                    appMode === 'mirror' 
                      ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' 
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-bold">Modalità standard mirror</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400">Riceve la parola esatta cercata</p>
                  </div>
                  {appMode === 'mirror' && <div className="w-4 h-4 bg-[#1a73e8] rounded-full shadow-[0_0_8px_rgba(26,115,232,0.6)]" />}
                </button>

                <button
                  onClick={() => {
                    setAppMode('ai');
                    setShowSecretMenu(false);
                  }}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                    appMode === 'ai' 
                      ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' 
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-bold">Prompt AI: Magnum Opus</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400">Riceve un output elaborato dall'AI</p>
                  </div>
                  {appMode === 'ai' && <div className="w-4 h-4 bg-[#1a73e8] rounded-full shadow-[0_0_8px_rgba(26,115,232,0.6)]" />}
                </button>

                {appMode === 'ai' && (
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3 border border-gray-200">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Input</label>
                      <input 
                        type="text" 
                        value={magnumOpusInput}
                        onChange={(e) => setMagnumOpusInput(e.target.value)}
                        placeholder="Cosa vuoi testare?"
                        className="w-full p-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    
                    <button
                      onClick={handleTestMagnumOpus}
                      disabled={isTestLoading || !magnumOpusInput.trim()}
                      className={`w-full py-2 px-4 rounded-lg text-sm font-bold transition-all shadow-sm ${
                        isTestLoading || !magnumOpusInput.trim()
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                      }`}
                    >
                      {isTestLoading ? 'ELABORAZIONE...' : 'TEST'}
                    </button>

                    <div className="flex flex-col space-y-1 pt-2 border-t border-gray-100">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Output</label>
                      <div className="w-full p-2 text-sm bg-white border border-gray-200 rounded-lg min-h-[40px] flex items-center font-mono text-blue-600 font-bold">
                        {magnumOpusOutput || '---'}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setAppMode('typing');
                    setShowSecretMenu(false);
                  }}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                    appMode === 'typing' 
                      ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' 
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-bold">Real time typing</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400">Riceve le lettere in tempo reale</p>
                  </div>
                  {appMode === 'typing' && <div className="w-4 h-4 bg-[#1a73e8] rounded-full shadow-[0_0_8px_rgba(26,115,232,0.6)]" />}
                </button>

                <button
                  onClick={() => {
                    setAppMode('blackScreenPeek');
                    setShowSecretMenu(false);
                    // Force fullscreen immediately on mode selection (user gesture)
                    try {
                      if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen();
                      }
                    } catch (err) {
                      console.error("Fullscreen error", err);
                    }
                  }}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                    appMode === 'blackScreenPeek' 
                      ? 'border-[#1a73e8] bg-blue-50 text-[#1a73e8]' 
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-bold">Black screen Peek</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400">Riceve la parola su schermo nero</p>
                  </div>
                  {appMode === 'blackScreenPeek' && <div className="w-4 h-4 bg-[#1a73e8] rounded-full shadow-[0_0_8px_rgba(26,115,232,0.6)]" />}
                </button>
              </div>

              <button
                onClick={() => setShowSecretMenu(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
              >
                Chiudi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BLACK SCREEN PEEK OVERLAY */}
      <AnimatePresence>
        {appMode === 'blackScreenPeek' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center overflow-hidden touch-none"
            onTouchStart={(e) => {
              if (!isPeekStarted || !isTapToShowEnabled) return;
              const touchY = e.touches[0].clientY;
              const screenHeight = window.innerHeight;
              if (touchY < screenHeight * 0.9) {
                // Top 90%
                setIsPeekVisibleManually(true);
              } else {
                // Bottom 10% - LOCK
                setIsPeekVisibleManually(true);
                setIsPeekLocked(true);
              }
            }}
            onTouchEnd={() => {
              if (!isPeekStarted || !isTapToShowEnabled || isPeekLocked) return;
              setIsPeekVisibleManually(false);
            }}
          >
            {/* Exit button - always visible except when explicitly hidden for maximum stealth if needed */}
            {!isPeekStarted && (
              <button 
                onClick={() => {
                  setAppMode('mirror');
                  // Exit fullscreen only here
                  try {
                    if (document.exitFullscreen) {
                      document.exitFullscreen();
                    }
                  } catch (e) {}
                }}
                className="absolute top-6 right-6 text-gray-600 hover:text-gray-400 transition-colors"
              >
                Chiudi Modalità
              </button>
            )}

            {/* Slider and Setup UI - Only visible if Peek hasn't started */}
            {!isPeekStarted && (
              <div className="flex flex-col items-center space-y-8 w-full max-w-sm px-6">
                <h3 className="text-gray-500 text-sm font-medium uppercase tracking-widest">
                  Configurazione Peek
                </h3>
                
                <div className="w-full flex flex-col items-center space-y-4">
                  <div className="flex justify-between w-full text-[10px] text-gray-600 font-mono">
                    <span>BIANCO</span>
                    <span>GRIGIO</span>
                    <span>NERO</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="255"
                    step="1"
                    value={255 - peekBrightness} // Mirroring for left=white, right=black
                    onChange={(e) => setPeekBrightness(255 - parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                </div>

                {/* Toggle Tocca per mostrare */}
                <div className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-800">
                  <span className="text-xs text-gray-500 font-medium tracking-tight">Tocca per mostrare</span>
                  <button 
                    onClick={() => setIsTapToShowEnabled(!isTapToShowEnabled)}
                    className={`w-10 h-5 rounded-full transition-all flex items-center px-1 ${
                      isTapToShowEnabled ? 'bg-[#1a73e8]' : 'bg-gray-800'
                    }`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isTapToShowEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Toggle Deleted word */}
                <div className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-800">
                  <span className="text-xs text-gray-500 font-medium tracking-tight">Deleted word</span>
                  <button 
                    onClick={() => setIsDeletedWordToggleOn(!isDeletedWordToggleOn)}
                    className={`w-10 h-5 rounded-full transition-all flex items-center px-1 ${
                      isDeletedWordToggleOn ? 'bg-[#1a73e8]' : 'bg-gray-800'
                    }`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isDeletedWordToggleOn ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="pt-4 flex flex-col items-center space-y-2">
                  <button 
                    onClick={() => setIsPeekStarted(true)}
                    className="bg-transparent border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 px-8 py-2 rounded-full text-xs font-bold tracking-[0.2em] transition-all uppercase"
                  >
                    START
                  </button>
                  <p className="text-[10px] text-gray-700 italic">Clicca START per entrare in attesa</p>
                </div>
              </div>
            )}

            {/* Preview / Result Text - Always in bottom right */}
            <div 
              className="absolute bottom-8 right-8 text-xl font-medium transition-all duration-300 select-none cursor-pointer z-[210] pointer-events-auto px-4 py-2 flex flex-col items-end"
              style={{ 
                color: `rgb(${peekBrightness}, ${peekBrightness}, ${peekBrightness})`,
                opacity: (!isPeekStarted) 
                  ? 1 
                  : (isTapToShowEnabled ? (isPeekVisibleManually ? 1 : 0) : 1)
              }}
              onDoubleClick={() => {
                setIsPeekStarted(false);
                setPeekResult(null);
                setIsPeekVisibleManually(false);
                setIsPeekLocked(false);
              }}
            >
              {!isPeekStarted ? (
                "Testo di prova"
              ) : (
                peekResult && (
                  <div className="flex flex-col items-end">
                    {/* Show deleted words only if toggle is ON and they exist */}
                    {isDeletedWordToggleOn && peekResult.deletedWords && peekResult.deletedWords.length > 0 && (
                      peekResult.deletedWords.map((word, idx) => (
                        <div key={`deleted-${idx}`} className="mb-1 underline">
                          {idx + 1}. {word}
                        </div>
                      ))
                    )}
                    
                    {/* Show final query */}
                    <div>
                      {isDeletedWordToggleOn && peekResult.deletedWords && peekResult.deletedWords.length > 0 
                        ? `${peekResult.deletedWords.length + 1}. ` 
                        : isDeletedWordToggleOn ? "1. " : ""}
                      {peekResult.query}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Exit wait mode shortcut - double tap top center */}
            {isPeekStarted && (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-transparent z-[210] pointer-events-auto"
                onDoubleClick={() => {
                  setIsPeekStarted(false);
                  setPeekResult(null);
                  setIsPeekVisibleManually(false);
                  setIsPeekLocked(false);
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        body {
          padding-bottom: ${isSearchActive ? '0' : '56px'};
        }
      `}</style>
    </div>
  );
}
