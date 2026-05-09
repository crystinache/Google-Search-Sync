import { GoogleGenAI } from "@google/genai";

// Use a fallback for the API key to avoid crashes if the env var is missing during build
const API_KEY = (process.env.GEMINI_API_KEY as string) || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function getMostImportantWork(query: string, language: string = "it"): Promise<string> {
  if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not defined. AI features will be disabled.");
    return query;
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
    // Remove any trailing punctuation or quotes that the AI might include
    const cleanedResult = result?.replace(/[".!]$/g, '');
    return cleanedResult || query;
  } catch (error) {
    console.error("AI Error:", error);
    return query; // Fallback to original query
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
