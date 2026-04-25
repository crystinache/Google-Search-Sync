# Search Sync (Google Search Simulator)

Un simulatore di ricerca Google sincronizzato in tempo reale.

## Caratteristiche
- 🔍 Ricerca Google Web e Immagini.
- 🤖 Suggerimenti AI (Gemini) per i lavori più importanti di un argomento.
- 🔄 Sincronizzazione in tempo reale tra diversi browser/dispositivi tramite Firebase.
- ⚡️ Creato con React, Vite e Tailwind CSS.

## Distribuzione su Vercel

Questo progetto è pronto per essere distribuito su Vercel tramite GitHub.

### 1. Prerequisiti
- Un account [GitHub](https://github.com).
- Un account [Vercel](https://vercel.com).
- Un account [Firebase](https://firebase.google.com) configurato (il file `firebase-applet-config.json` deve essere presente).

### 2. Passaggi per il Deploy
1. Carica questo codice in un repository GitHub.
2. Vai su Vercel e clicca su **"Add New"** > **"Project"**.
3. Importa il repository GitHub.
4. **Configurazione Variabili di Ambiente (Environment Variables):**
   Nella sezione "Environment Variables", aggiungi la seguente chiave:
   - `GEMINI_API_KEY`: Inserisci la tua chiave API di Google Gemini (puoi ottenerla su [Google AI Studio](https://aistudio.google.com/app/apikey)).
5. Clicca su **"Deploy"**.

### 3. Configurazione Firebase
Assicurati che `firebase-applet-config.json` sia incluso nel repository. In produzione, ricorda di:
1. Abilitare l'autenticazione **Anonima** nella console Firebase.
2. Abilitare **Cloud Firestore**.
3. Configurare le regole di sicurezza di Firestore (usa il file `firestore.rules` incluso).
4. Aggiungere il dominio di Vercel (es. `tuo-app.vercel.app`) ai domini autorizzati in **Authentication > Settings > Authorized domains**.

## Sviluppo Locale
```bash
npm install
npm run dev
```
