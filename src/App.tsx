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
import { Search, Mic, Menu, Grid, Info, Sparkles } from 'lucide-react';
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
  const [appMode, setAppMode] = useState<'mirror' | 'ai'>('mirror');
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [searchType, setSearchType] = useState<'web' | 'images'>('web');
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastRedirectId = useRef<string | null>(null);
  const lastHandledSyncId = useRef<string | null>(null);
  const isInitialSnapshot = useRef(true);

  const appId = "google-search-simulator"; 
  const SHARED_DOC_PATH = `artifacts/${appId}/public/data/shared_search/latest_query`;

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
    return () => unsubscribe();
  }, [isAuthReady, user]);

  const handleSearch = async () => {
    if (!isAuthReady || !user || !query.trim()) return;

    const currentQueryText = query.trim();
    
    // 1. Immediate redirection for the sender (direct location change to avoid any popup block)
    // SENDER USES THEIR OWN LOCAL SEARCH TYPE
    const encodedQuery = encodeURIComponent(currentQueryText);
    const googleUrl = searchType === 'images' 
      ? `https://www.google.com/search?q=${encodedQuery}&tbm=isch` 
      : `https://www.google.com/search?q=${encodedQuery}`;
    
    // 2. Perform database write silently in the background
    // SENDER ONLY SENDS THE RAW QUERY
    try {
      const processSearch = async () => {
        const newRedirectId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        const data = {
          query: currentQueryText,
          timestamp: Date.now(),
          userId: user.uid,
          uniqueId: newRedirectId
        };

        await setDoc(doc(db, SHARED_DOC_PATH), data);
      };

      // Firestore writes are very fast, so we'll start it and then redirect.
      processSearch();
      
      // Shortest possible delay to ensure the firestore call is dispatched
      setTimeout(() => {
        window.location.href = googleUrl;
      }, 100);

    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, SHARED_DOC_PATH);
      window.location.href = googleUrl;
    }
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
    
    const encodedFinalQuery = encodeURIComponent(finalQuery);
    
    // RECEIVER USES THEIR OWN LOCAL SEARCH TYPE
    const googleUrl = searchType === 'images'
      ? `https://www.google.com/search?q=${encodedFinalQuery}&tbm=isch`
      : `https://www.google.com/search?q=${encodedFinalQuery}`;
    
    // Redirect current page immediately
    window.location.href = googleUrl;
    
    // Clean up from DB
    try {
      await deleteDoc(doc(db, SHARED_DOC_PATH));
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  };

  // Function to simulate a remote query (for testing or if auto-sync fails)
  const simulateRemoteQuery = async () => {
    if (!pendingData) {
      setSyncMessage({ text: "Nessuna ricerca in attesa. Effettua prima una ricerca nella barra!", isError: true });
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    const { query: originalQuery, aiQuery, searchType: remoteSearchType } = pendingData;
    const encodedAiQuery = encodeURIComponent(aiQuery);
    const googleUrl = remoteSearchType === 'images'
      ? `https://www.google.com/search?q=${encodedAiQuery}&tbm=isch`
      : `https://www.google.com/search?q=${encodedAiQuery}`;
    const actionMsg = `AI Insight: Il lavoro più importante di "${originalQuery}" è "${aiQuery}". Apertura ricerca...`;
    
    setSyncMessage({ text: actionMsg, isError: false });
    window.open(googleUrl, '_blank');
    
    // CLEAR MEMORY ONLY AFTER THE SECOND SEARCH IS OPENED
    setTimeout(async () => {
      try {
        await deleteDoc(doc(db, SHARED_DOC_PATH));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, SHARED_DOC_PATH);
      }
      setSyncMessage(null);
      setPendingData(null);
    }, 3000);
  };

  return (
    <div className="bg-white min-h-screen flex flex-col font-sans antialiased overflow-x-hidden">
      {/* HEADER */}
      <AnimatePresence>
        {!isSearchActive && (
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-[480px] mx-auto flex justify-between items-center px-3 py-3 border-b border-gray-100 bg-white"
          >
            <div className="flex items-center space-x-6">
              <Menu className="w-6 h-6 text-gray-500 cursor-pointer" />
              <div className="flex space-x-6">
                <button 
                  onClick={() => setSearchType('web')}
                  className={`text-xs font-medium border-b-2 transition-all pb-1 ${
                    searchType === 'web' ? 'border-[#1a73e8] text-[#1a73e8]' : 'border-transparent text-gray-700 hover:text-gray-900'
                  }`}
                >
                  TUTTI
                </button>
                <button 
                  onClick={() => setSearchType('images')}
                  className={`text-xs font-medium border-b-2 transition-all pb-1 ${
                    searchType === 'images' ? 'border-[#1a73e8] text-[#1a73e8]' : 'border-transparent text-gray-700 hover:text-gray-900'
                  }`}
                >
                  IMMAGINI
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-5">
              <button className="p-1 rounded-full hover:bg-gray-100 transition duration-150">
                <Grid className="w-5 h-5 text-gray-600" />
              </button>
              <button 
                onDoubleClick={() => setShowSecretMenu(true)}
                className="bg-[#1a73e8] hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded transition duration-150 ease-in-out whitespace-nowrap"
              >
                registrati
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
                className="text-[56px] font-normal mb-8 select-none"
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
            }`}
          >
            <div 
              className={`flex items-center border transition-all duration-200 ${
                isSearchActive 
                  ? 'border-b border-t-0 border-l-0 border-r-0 border-gray-300 rounded-none px-4 shadow-none' 
                  : 'border-gray-200 rounded-full px-4 shadow-sm hover:shadow-md'
              } h-11 bg-white`}
            >
              <Search className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  setIsSearchActive(true);
                  if (suggestions.length > 0) setShowSuggestions(true);
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
                placeholder="Cerca su Google"
                className="flex-grow text-lg outline-none bg-transparent h-full"
              />
              <Mic className="w-5 h-5 text-gray-500 ml-3 cursor-pointer flex-shrink-0" />
            </div>

            {/* SUGGESTIONS DROPDOWN */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`absolute left-0 right-0 bg-white border-x border-b border-gray-200 z-50 overflow-hidden ${
                    isSearchActive ? 'top-full' : 'rounded-b-2xl mt-[-1px] shadow-lg'
                  }`}
                >
                  <div className="py-2">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center space-x-3 text-sm text-gray-800"
                        onClick={() => {
                          setQuery(suggestion);
                          setShowSuggestions(false);
                          setTimeout(async () => {
                            const trimmedSuggestion = suggestion.trim();
                            const encodedQuery = encodeURIComponent(trimmedSuggestion);
                            const googleUrl = searchType === 'images'
                              ? `https://www.google.com/search?q=${encodedQuery}&tbm=isch`
                              : `https://www.google.com/search?q=${encodedQuery}`;
                            
                            try {
                              const newRedirectId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
                              const data = {
                                query: trimmedSuggestion,
                                timestamp: Date.now(),
                                userId: user?.uid,
                                uniqueId: newRedirectId
                              };
                              await setDoc(doc(db, SHARED_DOC_PATH), data);
                            } catch (e) {
                              console.error("Silent sync error:", e);
                            }

                            // Redirect
                            window.location.href = googleUrl;
                          }, 100);
                        }}
                      >
                        <Search className="w-4 h-4 text-gray-400" />
                        <span>{suggestion}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* STATUS MESSAGES */}
          <div className="mt-8 text-center text-sm min-h-[24px]">
            {isLoading && (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-[#1a73e8] rounded-full animate-spin"></div>
                <span className="text-[#1a73e8] font-medium">Caricamento...</span>
              </div>
            )}
            {syncMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl ${
                  syncMessage.isError ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600 cursor-pointer'
                }`}
                onClick={() => !syncMessage.isError && simulateRemoteQuery()}
              >
                {!syncMessage.isError && (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 animate-pulse text-amber-500" />
                    <span className="font-bold underline">SINCRONIZZA ORA</span>
                  </div>
                )}
                <p className="text-center">{syncMessage.text}</p>
              </motion.div>
            )}
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
            className="fixed bottom-0 left-0 right-0 w-full max-w-[480px] mx-auto bg-gray-50 p-4 border-t border-gray-200"
          >
            <div className="flex justify-center space-x-6 text-xs text-gray-700">
              <a href="#" className="hover:underline">Immagini</a>
              <a href="#" className="hover:underline">Privacy</a>
              <a href="#" className="hover:underline">Termini</a>
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
                    <p className="font-bold">Prompt AI: Analisi Migliore</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400">Riceve un output elaborato dall'AI</p>
                  </div>
                  {appMode === 'ai' && <div className="w-4 h-4 bg-[#1a73e8] rounded-full shadow-[0_0_8px_rgba(26,115,232,0.6)]" />}
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

      <style>{`
        body {
          padding-bottom: ${isSearchActive ? '0' : '56px'};
        }
      `}</style>
    </div>
  );
}
