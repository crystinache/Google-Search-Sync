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
      contents: `Crea un acrostico rapidissimo di ${cleanWord.length} parole per "${cleanWord}".
      
      REGOLE:
      1. Parole totali: ESATTAMENTE ${cleanWord.length}.
      2. Ogni parola deve iniziare con la lettera corrispondente di "${cleanWord}".
      3. Lingua: "${language}".
      4. SOLO il testo, minuscolo, niente punteggiatura.

      Esempio "SOLE": splende oro luce eterna`,
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
  if (!query || query.trim() === "") return [];
  
  try {
    const url = `https://${language}.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&search=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Wikipedia responses not ok: ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].map((s: string) => s.toLowerCase());
    }
    return [];
  } catch (error) {
    console.error("Wikipedia OpenSearch error:", error);
    return [];
  }
}
