# Firebase Auth Self-Hosting Helpers

Questo percorso è predisposto per ospitare i file helper di Firebase Auth per evitare il blocco dei cookie di terze parti su Safari/iOS (ITP).

## Come attivare il Self-Hosting di Firebase Auth su GitHub Pages:

1. Scaricare i file helper ufficiali generati da Firebase per il vostro progetto. 
   Di solito è possibile recuperarli compilando il vostro progetto con Firebase CLI (`firebase init hosting`) oppure scaricando i file statici forniti da Google:
   - `__/auth/handler`
   - `__/auth/iframe`
   - `__/firebase/init.js`
2. Copiare i file scaricati all'interno di questa cartella in modo che siano raggiungibili pubblicamente su GitHub Pages sotto i rispettivi percorsi:
   - `public/__/auth/handler.html` (o `handler`)
   - `public/__/auth/iframe.html` (o `iframe`)
3. Abilitare il self-hosting nel file `.env.local` impostando la variabile:
   `VITE_FIREBASE_USE_SELF_HOST=true`
4. Eseguire il deploy dell'applicazione.
