import { GoogleGenAI } from "@google/genai";

// Use a fallback for the API key to avoid crashes if the env var is missing during build
const API_KEY = (process.env.GEMINI_API_KEY as string) || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function getMostImportantWork(query: string, language: string = "it"): Promise<string> {
  if (!API_KEY || API_KEY === "") {
    console.warn("GEMINI_API_KEY is missing. Please check your environment variables.");
    return `[KEY MISSING] ${query}`;
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Identifica la singola opera, risultato storico, capolavoro, o associazione più iconica per cui "${query}" è celebrato nel mondo. 

      REGOLE DI RISPOSTA:
      1. Sii SPECIFICO: Evita descrizioni generiche come "calciatore", "attore" o "politico".
      2. Per gli ATLETI: Indica il loro successo più leggendario (es: "Euro 2016", "Mondiali 2022") o la squadra/club a cui sono indissolubilmente legati (es: "Real Madrid" per Cristiano Ronaldo, "Chicago Bulls" per Jordan).
      3. Per gli ARTISTI/AUTORI: Indica il loro capolavoro massimo (es: "Gioconda", "Promessi Sposi").
      4. Per PERSONAGGI STORICI: Indica l'atto o l'evento per cui hanno cambiato il mondo.
      5. LINGUA: Rispondi rigorosamente in "${language}".

      Esempi (lingua "it"):
      - "Cristiano Ronaldo" -> "Real Madrid" o "Euro 2016"
      - "Messi" -> "Campione del Mondo 2022"
      - "Tom Cruise" -> "Top Gun"
      - "Oppenheimer" -> "Progetto Manhattan"
      - "Napoleon" -> "Waterloo"

      Restituisci SOLO il nome o il titolo dell'opera/risultato. Nessun altro testo, nessuna spiegazione.`,
    });

    const result = response.text?.trim();
    if (!result) {
      console.warn("AI returned empty result");
      return query;
    }
    // Remove any trailing punctuation or quotes that the AI might include
    const cleanedResult = result.replace(/[".!]$/g, '');
    return cleanedResult;
  } catch (error: any) {
    console.error("AI Error:", error);
    
    // Check for specific Quota error (429)
    if (error?.message?.includes('429') || error?.status === 429) {
      return `[QUOTA EXCEEDED] ${query}`;
    }
    
    // Return specific error for debugging if it's a known API error
    if (error?.message) {
      return `[AI ERROR: ${error.message.substring(0, 40)}] ${query}`;
    }
    return query; // Fallback to original query
  }
}

export async function getHaikuPoesia(query: string, language: string = "it"): Promise<string> {
  if (!API_KEY || API_KEY === "") {
    return `[KEY MISSING] ${query}`;
  }
  
  const cleanWord = query.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (cleanWord.length === 0) return query;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generazione RAPIDA acrostico poetico/enigmatico per "${cleanWord}".
      
      VINCOLI:
      1. ESATTAMENTE ${cleanWord.length} parole.
      2. Ogni parola deve iniziare con la lettera corrispondente di "${cleanWord}".
      3. Stile: Breve poesia evocativa o indovinello.
      4. Lingua: "${language}".
      5. Output: SOLO le parole, tutto minuscolo, senza punteggiatura.

      Esempio: "SOLE" -> splendido oro luce eterna`,
    });

    const result = response.text?.trim().toLowerCase();
    return result || query;
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.status === 429) {
      return `[QUOTA EXCEEDED] ${query}`;
    }
    return query;
  }
}

export async function getSearchSuggestions(query: string, language: string = "it"): Promise<string[]> {
  if (!query || query.length < 2) return [];
  if (!API_KEY) return [];
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Fornisci 5 suggerimenti di ricerca popolari rigorosamente nella lingua: "${language}" che iniziano con o sono altamente rilevanti per: "${query}". 
      I suggerimenti DEVONO essere query di ricerca naturali per una persona che parla "${language}".
      Restituisci SOLO un array JSON di stringhe. Nessun testo extra, nessun blocco di codice markdown.`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const result = response.text?.trim();
    return JSON.parse(result || "[]");
  } catch (error) {
    console.error("AI Suggestions Error:", error);
    return [];
  }
}
