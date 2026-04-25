import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function getMostImportantWork(query: string, language: string = "it"): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Identifica la singola opera, risultato, ruolo o cosa più significativa per cui la seguente persona o argomento è più famoso o conosciuto nel mondo: "${query}". 

      CRITICO: Restituisci il risultato rigorosamente nella lingua: "${language}".

      Esempi (se la lingua è "it"):
      - "Trump" -> "Presidente degli Stati Uniti"
      - "Di Caprio" -> "Titanic"
      - "Einstein" -> "Teoria della Relatività"
      - "Apple" -> "iPhone"
      - "Dante" -> "Divina Commedia"

      Restituisci SOLO il nome di tale risultato o opera. Nessuna spiegazione, nessun testo extra, nessuna punteggiatura. 
      Se è una persona, concentrati sulla sua carica più alta o sul suo capolavoro più grande.
      Se non sei sicuro, restituisci l'associazione più comune nella lingua richiesta.`,
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
