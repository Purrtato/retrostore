# RetroStore

En webbshop för retrospel och elektronik, med integrationer mot en leverantör, Algolia, Stripe, Supabase Storage och PostNord.

## 1. Kom igång

**Deployad shop:** https://e-handel-kunskapskontroll.vercel.app  
(backend: https://e-handel-kunskapskontroll.onrender.com, gratistjänsten på Render somnar, så första anropet kan ta en halv minut)

### Starta lokalt

```bash
# Backend
cd backend
npm install
cp .env.example .env     # fyll i dina egna värden, se nedan
npm run dev              # startar på port 3000

# Frontend (i en ny terminal)
cd frontend
npm install
npm run dev              # startar på port 5173
```

Frontend använder `VITE_API_URL` som adress till backend (standard: `http://localhost:3000`).

### Konton och nycklar

Alla tjänster används bara i testläge eller med gratiskonton. Nycklarna ligger bara i `backend/.env` (se `.env.example`), och i produktion i Renders miljövariabler. Frontend har bara `VITE_API_URL`.

| Tjänst | Vad som behövs |
|---|---|
| Supabase | Databas (`DATABASE_URL`) och en publik bucket `product-images` för Storage (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`) |
| Leverantör | `SUPPLIER_API_URL`, `SUPPLIER_API_KEY` (demonyckel), `SUPPLIER_BRANCH` |
| Algolia | `ALGOLIA_APP_ID`, `ALGOLIA_WRITE_KEY`, `ALGOLIA_SEARCH_KEY`, `ALGOLIA_INDEX_NAME` |
| Stripe (testläge) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PostNord (sandlåda) | `POSTNORD_API_KEY`, `POSTNORD_BASE_URL`, `SHOP_POSTAL_CODE` |
| Admininloggning | `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CLIENT_URL` |
| Google (inloggning) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Resend (e-post) | `RESEND_API_KEY`, `EMAIL_FROM` |

**Admin:** logga in på `/admin/login`. Läraren får kontot i inlämningskommentaren (aldrig i repot). Lokalt väljer du själv `ADMIN_USERNAME` och `ADMIN_PASSWORD` i `.env`.

### Extra steg för att testa integrationerna lokalt

- **Stripe-webhooken:** installera Stripe CLI och kör:
  `stripe listen --events "checkout.session.completed,checkout.session.expired" --forward-to localhost:3000/webhooks/stripe`.
  Lägg det `whsec_...` som skrivs ut i `STRIPE_WEBHOOK_SECRET` och starta om backend. Testkort: `4242 4242 4242 4242`.
- **Deployad webhook:** i Stripe Dashboard finns en webhook-endpoint till `https://e-handel-kunskapskontroll.onrender.com/webhooks/stripe` med händelserna `checkout.session.completed` och `checkout.session.expired`. Endpointens signing secret ligger som `STRIPE_WEBHOOK_SECRET` på Render.
- **PostNord-sandlådan** har bara testdata för vissa postnummer. Postnumret `11153` fungerar.
- **Sökindexet** fylls med knappen "Synka sökindex" på adminsidan (och uppdateras sedan automatiskt).
- **Google-inloggning:** skapa en OAuth-klient av typen Web application i Google Cloud Console. Lägg till `http://localhost:3000/auth/google/callback` och `https://e-handel-kunskapskontroll.onrender.com/auth/google/callback` som Authorized redirect URIs. `GOOGLE_REDIRECT_URI` måste vara identisk med den adress som används (olika värden lokalt och på Render). Appen ber bara om `openid email profile`. Hur läraren kommer in med sitt Google-konto beskrivs i inlämningskommentaren.
- **E-post:** utan egen domän skickar Resend från `onboarding@resend.dev`, som bara kan skicka till e-postadressen på det Resend-konto som äger nyckeln. Testa med den adressen.
- **Databasen:** förutom grundtabellerna (`products`, `orders`, `order_items`) behövs dessa tillägg:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS article_number text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_path text;
CREATE UNIQUE INDEX IF NOT EXISTS products_article_number_key ON products (article_number);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_key ON orders (stripe_session_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_option text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_postal_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_point_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_point_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_point_address text;

CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);
```

Tabellen för inloggningssessioner (`session`) skapas automatiskt av servern.

### Så är koden uppdelad

`backend/integrations/` har en adapter per extern tjänst (leverantör, Algolia, Stripe, Supabase Storage, PostNord, Google, Resend). Adaptrarna hanterar sådant som URL:er, nycklar, format och felkoder, och returnerar data i ett format som passar shoppen. `services/` innehåller logiken, `routes/` HTTP-endpoints och `config/` shoppens fraktprislista.

## Så gjorde jag varje labb

**Labb 1 – Import**

I den första labben byggde jag så att admin kan importera leverantörens produktkatalog via CSV eller XML. EAN sparas som text i stället för som ett tal, eftersom den annars kan tappa inledande nollor. Varianterna sparas som en lista i `jsonb`, eftersom olika produkter kan ha olika många varianter.

Om lagersaldot saknas sätts det till 0, så att en produkt inte råkar gå att köpa trots att jag inte vet hur många som finns i lager. Leverantören har varken beskrivningar eller bilder, så importen skriver inte över den informationen. CSV-filen använder Windows-1252, vilket gjorde att jag behövde avkoda den med rätt teckenkodning. Produkter som saknar viktig information, till exempel priset på LEV-1037, hoppas över.

**Labb 2 – Sök**

Jag använder Algolia för att söka bland produkterna. Varje produkt får sitt artikelnummer som `objectID`, så att den går att hitta igen i sökindexet.

Sökningen går via min egen endpoint, `GET /api/search`, där jag validerar parametrarna med Zod. Till exempel måste `page` vara minst 1 och `pageSize` får inte vara högre än 50. Svaret skickas sedan tillbaka i ett format som passar shoppen.

Jag sparar produkten i databasen först och uppdaterar sedan Algolia, så att sökindexet får den senaste informationen. Om uppdateringen av Algolia misslyckas finns produkten ändå kvar i databasen, och admin kan synka sökindexet igen senare.

**Labb 3 – Betalning**

När kunden går vidare till betalning skapas ordern i databasen med status obetald. Kunden skickas sedan vidare till Stripe Checkout för att genomföra köpet.

Det är först när min server har tagit emot och verifierat Stripes webhook som ordern markeras som betald och lagersaldot minskas. Jag har också sett till att lagret bara minskas en gång per order, även om samma betalningsbekräftelse skulle komma in flera gånger. Priserna räknas alltid ut på servern, så att kunden inte själv kan ändra dem i webbläsaren.

**Labb 4 – Bilder**

Admin kan ladda upp produktbilder via min server till Supabase Storage. Innan bilden laddas upp kontrollerar servern att filen faktiskt är en JPEG eller PNG, utifrån filens innehåll och inte bara filnamnet. Jag har också satt en gräns på 2 MB och ger varje uppladdad bild en unik sökväg.

När en bild byts ut sparas den nya bilden först. Den gamla tas bort efteråt, så att produkten inte blir utan bild om den nya uppladdningen misslyckas.

**Labb 5 – Frakt**

I kassan kan kunden ange sitt postnummer och se vilka ombud och leveranstider PostNord erbjuder. Kunden kan sedan välja mellan ombud och hemleverans.

Jag har lagt fraktpriserna i en egen prislista i shoppen: 59 kr, 99 kr eller gratis frakt vid köp över 500 kr. Servern räknar ut frakten och skickar med den som en egen rad i Stripe-betalningen. Den kontrollerar också att ombudet kunden väljer faktiskt finns för det angivna postnumret.

**Labb 6 – Kundinloggning med Google**

Kunder loggar in med sitt Google-konto via OAuth 2.0 och OpenID Connect. Allt sker via min server, och Googles tokens når aldrig webbläsaren. Kunden identifieras med Googles `sub`, inte med e-postadressen, och skapas i tabellen `customers` första gången hen loggar in. Under Mina sidor ser kunden sina egna beställningar. En order som läggs inloggad kopplas till kunden via sessionen på servern (React skickar aldrig något kund-id), och `GET /customer/orders` svarar 401 utan inloggning. Avbruten inloggning och fel från Google ger ett begripligt meddelande på inloggningssidan.

**Labb 8 – Orderbekräftelse via e-post**

När Stripe-webhooken har markerat en order som betald skickar shoppen en orderbekräftelse via Resend. Adaptern (`integrations/emailAdapter.js`) är den enda filen som känner till Resends adress och nyckel, och anropet har en timeout. Mejlet har ordernummer i ämnesraden, kundens namn, produkterna med antal och pris, frakten och totalsumman, både som html och text. Allt som kommer från kunden (namnet) och produktnamnen escapas innan de hamnar i html:en. Varje mejl har en `Idempotency-Key` knuten till ordern (`order-confirmation/<orderns id>`), så att samma webhook två gånger ändå ger ett mejl. Ett misslyckat mejl stoppar inte ordern: felet loggas, ordern är redan betald, och webhooken svarar fortfarande 200. Resends svar valideras med Zod.

Begränsningar: utan egen domän kan mejlet bara skickas till adressen på mitt Resend-konto. Resend sparar idempotensnycklar i 24 timmar, så om samma webhook skulle skickas igen efter mer än ett dygn kan ett nytt mejl skickas. Använder man samma nyckel med ett annat innehåll avvisar Resend anropet (409), men eftersom mejlet byggs från ordern i databasen blir innehållet detsamma vid ett omskick.

### Hur jag använde AI (Labb 5)

**Verktyg:** Claude i webbläsaren. Eftersom Claude inte kunde läsa mitt projekt direkt fick jag klistra in kod och svar manuellt. Jag har aldrig klistrat in någon API-nyckel.

**Så använde jag det:** Jag började med att beskriva min teknikstack (Express, React och Supabase) och klistrade in kravspecifikationen för labb 5. AI:n hjälpte mig att skriva koden för PostNord-integrationen, fraktpriserna och kopplingen till Stripe-betalningen.

Sedan testade jag själv mot PostNords sandlåda och tog hjälp av AI:n när något inte fungerade. Jag kunde till exempel köra `node scripts/postnordProbe.js 19557` i backend utan att få det resultat jag förväntade mig. Då klistrade jag in svaren från PostNord, bland annat 404, 400 och 502, för att försöka förstå vad som var fel.

När jag fortfarande fick 502 vid hämtning av leveranstider gick jag till PostNords utvecklarportal. Jag klistrade in listan över API:erna och sedan Swagger-dokumentationen för *Transit time calculation V1 and V2*, så att AI:n kunde hjälpa mig att anpassa koden efter rätt API. Jag använde också AI:n för att gå igenom mina egna filer, till exempel `routes/shipping.js`.

**Vad som inte fungerade direkt:** De första förslagen stämde inte helt med PostNords dokumentation.

- **Ombud:** Den första sökvägen gav 404 eftersom förslaget blandade ihop information från v5 med namn från den äldre v1-versionen. Jag saknade också parametern `returnType=json`, vilket gav 400. Jag upptäckte dessutom att sandlådan inte hade testdata för alla postnummer. Exempelvis fungerade inte 19557, medan 11153 fungerade.
- **Leveranstid:** Här fick jag både 502 och 404 eftersom sökvägen och parameternamnen i förslagen kom från äldre dokumentation. I portalens Swagger hittade jag rätt API, *Transit time calculation V2*. Det använder sökvägen `/v2/transittime/addresstoaddress`, andra parameternamn (`originPostalCode`, `destinationPostalCode` och `startTime`) och returnerar en lista med `estimatedTimeOfArrival`. Tjänstekoderna 17 för hemleverans och 19 för ombud stämde med dokumentationen. Jag behövde också använda svensk lokal tid för `startTime`.

**Hur jag kontrollerade lösningen:** Jag skrev ett eget testscript, `backend/scripts/postnordProbe.js`, för att kunna se PostNords råa svar utan att skriva ut API-nyckeln. Jag körde det mot min egen sandlådenyckel och jämförde svaren med Swagger-dokumentationen i portalen.

**Hur jag löste problemen:** Jag rättade sökvägarna och parametrarna och anpassade koden efter hur svaren faktiskt såg ut enligt dokumentationen. Jag har samlat PostNord-integrationen i en egen adapter, där jag hanterar sådant som API-anrop, format och fel. Svaren valideras med Zod innan de används i shoppen, och servern kontrollerar att kundens valda ombud finns för postnumret. API-nyckeln finns bara på servern.

**Vad jag lärde mig:** AI:ns förslag kunde se rimliga ut, men ändå bygga på information som inte längre stämde. Jag behövde därför testa mot sandlådan och jämföra med PostNords egen dokumentation i stället för att bara utgå från att koden fungerade.

### Kända begränsningar

- Lagersaldot reserveras inte när en order skapas. Det innebär att två kunder kan hinna köpa samma sista exemplar innan någon av dem har betalat. I en riktig butik skulle jag behöva reservera varan medan Stripe-sessionen pågår.
- Vid hemleverans samlar shoppen inte in någon fullständig leveransadress, utan bara postnummer.

## 2. Reflektion

**1. Varför jag valde olika integrationslösningar**

Jag använder olika lösningar beroende på vad varje tjänst behöver göra.

Leverantörens katalog hämtas som CSV- eller XML-fil via ett REST-anrop när admin startar importen. Det passar eftersom katalogen innehåller många produkter och importeras på en gång, i stället för att uppdateras i realtid.

Algolia, Supabase Storage och PostNord använder REST-API:er. Min server skickar exempelvis produkter och bilder, eller hämtar sökresultat, ombud och leveranstider.

Stripe fungerar lite annorlunda. Kunden skickas vidare till Stripes betalsida och sedan får min server en webhook när betalningen genomförs. Jag valde den lösningen eftersom betalningen sker utanför min egen sajt och bekräftelsen kommer först efteråt.

**2. Varför jag hanterar integrationerna via Express**

Jag ville att min server skulle sköta sådant som inte ska kunna styras direkt från webbläsaren. Det gäller till exempel hemliga API-nycklar från Stripe, Algolia, Supabase och PostNord.

Servern räknar också ut produktpriser och frakt. React skickar produkt-id och antal, men det är servern som räknar ut vad kunden ska betala. På så sätt kan kunden inte bara ändra priset i webbläsaren och betala mindre.

Jag använder även Zod för att kontrollera data från externa tjänster och servern verifierar att exempelvis ett valt ombud faktiskt finns för kundens postnummer. Stripes webhook behöver också tas emot och verifieras på serversidan.

**3. Varför jag använder befintliga tjänster i stället för att bygga allt själv**

Jag valde att använda färdiga tjänster eftersom flera av funktionerna hade varit ganska stora projekt att bygga från grunden.

- **Stripe:** Att hantera kortbetalningar själv skulle innebära mycket mer arbete med bland annat säkerhet, kortuppgifter och bedrägeriskydd. Med Stripe slipper jag hantera själva kortuppgifterna.
- **Algolia:** Att bygga en egen sökmotor med stöd för stavfel och relevanta sökträffar hade varit ett eget projekt i sig.
- **Supabase Storage:** Egen fillagring skulle innebära att jag också behöver lösa saker som säkerhetskopior, tillgänglighet och att bilder laddas snabbt.
- **PostNord:** De har redan information om sina ombud och leveranstider. Om jag skulle lagra allt själv skulle informationen snabbt kunna bli inaktuell.
- **Leverantören:** Produktkatalogen tillhör leverantören, så jag behöver hämta den därifrån i stället för att försöka underhålla en egen kopia manuellt.

**4. Vad som händer om en tjänst inte fungerar**

Jag har försökt se till att ett fel hos en extern tjänst inte gör att hela shoppen slutar fungera eller att data bara sparas till hälften. Därför har jag bland annat satt timeouts på anropen och hanterar fel från tjänsterna.

- **Leverantören:** Jag hämtar och validerar katalogen innan jag startar databastransaktionen. Om hämtningen misslyckas sparas inget, och tillfälliga fel gör att anropet försöks igen upp till tre gånger.
- **Algolia:** Om produkten sparas i databasen men uppdateringen av sökindexet misslyckas finns produkten ändå kvar. Admin får en varning och kan synka indexet igen senare. Om själva sökningen misslyckas visas ett felmeddelande, men resten av shoppen kan fortfarande användas.
- **Stripe:** Om betalningen inte går igenom förblir ordern obetald. Kunden får ett begripligt felmeddelande, och om betalningssessionen löper ut markeras den övergivna ordern som avbruten.
- **Supabase Storage:** Om bilduppladdningen misslyckas får admin ett meddelande och den gamla bilden finns kvar på produkten.
- **PostNord:** Om ombudslistan inte går att hämta kan kunden inte välja ombud. Hemleverans fungerar däremot fortfarande, och leveranstiden visas bara när den går att hämta.

**5. Risker med att vara beroende av externa tjänster**

Det är smidigt att använda färdiga tjänster, men det innebär också att jag är beroende av att de fortsätter fungera och att deras villkor inte förändras på ett sätt som påverkar shoppen.

- **Stripe:** Det finns avgifter per betalning, och ändrade villkor kan påverka butiken. Kundens namn och e-postadress lagras både hos mig och hos Stripe, vilket innebär att jag behöver ta hänsyn till GDPR, bland annat när det gäller personuppgiftsbiträdesavtal och information till kunderna.
- **PostNord:** Här märkte jag själv hur mycket det kan påverka utvecklingen när dokumentation inte stämmer med äldre beskrivningar på nätet. Sandlådan hade dessutom begränsad testdata. Koden är beroende av att PostNords API:er fortsätter fungera som förväntat, och det finns även gränser för hur många anrop man får göra.
- **Algolia och Supabase:** Gratiskonton har begränsningar, och om shoppen växer kan tjänsterna börja kosta pengar.

Om en tjänst skulle läggas ner, ändra sitt API eller bli för dyr skulle jag behöva hitta en annan lösning. Därför har jag lagt varje integration bakom en egen adapter. Det gör att jag kan samla ändringarna på ett ställe i stället för att behöva ändra kod på flera olika ställen i projektet.

## 3. Så fungerar autentiseringen

Shoppen har två sorters inloggning. **Admin** loggar in med användarnamn och lösenord (från Inlämningsuppgift 1): uppgifterna ligger som miljövariabler på servern och jämförs på ett sätt som inte läcker information via svarstiden. **Kunder** loggar in med Google. Båda använder en server-sparad session. Labb 7 (GitHub-inloggning och issues, VG) har jag inte gjort.

### Inloggningsflödet med Google

1. Kunden klickar på "Logga in med Google". Det är en vanlig länk till min server (`/auth/google/start`), inte ett anrop från React.
2. Servern skapar tre slumpmässiga engångsvärden: `state`, `nonce` och en `code_verifier`. De sparas i kundens session på servern och skickas aldrig till webbläsaren. Kunden skickas vidare till Google med `scope=openid email profile` (det minsta jag behöver), `state`, `nonce` och en `code_challenge`, som är en hash av `code_verifier`.
3. Kunden loggar in hos Google och godkänner att shoppen får se namn och e-post.
4. Google skickar tillbaka kunden till min callback (`/auth/google/callback`) med en engångskod (`code`) och `state`.
5. Servern kontrollerar att `state` stämmer med det som sparades, och att inloggningen inte är äldre än tio minuter. Stämmer det inte avvisas inloggningen. Engångsvärdena tas bort ur sessionen oavsett resultat, så de kan aldrig användas två gånger.
6. Servern byter koden mot tokens i ett anrop direkt till Google, med min client secret och `code_verifier`.
7. Servern verifierar ID-token: signaturen mot Googles publika nycklar, att den är utfärdad av Google (`iss`), till min app (`aud`) och inte har gått ut (`exp`), samt att `nonce` stämmer. Innehållet valideras med Zod, och e-postadressen måste vara verifierad av Google.
8. Kunden hittas via Googles `sub`, eller skapas om det är första gången. Jag använder aldrig e-postadressen för att känna igen kunden, eftersom den kan ändras och återanvändas.
9. Servern skapar en ny session med ett nytt sessions-id (skydd mot session fixation), sparar kundens id i den och skickar kunden till Mina sidor. React frågar sedan servern vem som är inloggad (`/customer/me`).

Avbruten inloggning, fel från Google, ett `state` som inte stämmer och en ogiltig ID-token skickar tillbaka kunden till inloggningssidan med en felkod, som React översätter till ett begripligt meddelande. Anropen till Google har timeout, så om Google inte svarar får kunden ett meddelande i stället för en kraschad sida.

### Vad state, PKCE och nonce skyddar mot

Jag använder alla tre, eftersom de skyddar mot olika saker:

- **state** skyddar mot att någon lurar kunden att slutföra en inloggning som någon annan har startat (CSRF mot callbacken). Servern avvisar ett svar som inte matchar det som sparades när kunden började.
- **PKCE** skyddar mot att en stulen `code` kan användas. Koden går bara att byta mot tokens tillsammans med `code_verifier`, som aldrig lämnar min server. Det är ett extra skydd utöver min client secret.
- **nonce** binder ID-token till just den här inloggningen, så att en gammal eller inskickad token inte kan återanvändas.

### Tokens

- **Authorization code:** en engångskod som syns i adressfältet när Google skickar tillbaka kunden. Den är värdelös utan min client secret och `code_verifier`.
- **ID-token (JWT):** innehåller kundens `sub`, e-post och namn. Den gäller ungefär en timme, används en enda gång för att identifiera kunden, och sparas inte.
- **Access-token:** Google skickar den också, men jag använder den inte och sparar den inte. Jag ber inte heller om någon refresh-token.
- **Shoppens session-cookie** (`connect.sid`): det enda som når webbläsaren. Den innehåller ett sessions-id som är signerat med `SESSION_SECRET`, är `httpOnly` (JavaScript kommer inte åt den) och `secure` i produktion, och gäller i åtta timmar. Själva sessionen ligger i databasen (tabellen `session`).

### Session eller JWT

Jag valde **session**. Skälen är att jag redan hade en Postgres-lagrad session för admin, att en session går att spärra direkt på servern (jag raderar den), och att ingenting läsbart ligger i webbläsaren, bara ett signerat id. En JWT hade gått att läsa av klienten och går inte att dra tillbaka före utgångstiden utan en spärrlista. Nackdelen med session är att servern måste slå upp sessionen i databasen vid varje anrop, och att lagringen måste delas om servern skulle skalas upp. En JWT passar bättre när flera tjänster ska verifiera användaren utan en gemensam databas.

Eftersom frontend (Vercel) och backend (Render) ligger på olika domäner sätter jag cookien med `SameSite=None; Secure` och tillåter cookies i CORS-inställningen. Det fungerar, men cookien räknas då som en tredjepartscookie när React anropar servern. Vissa webbläsare, till exempel Safari, blockerar sådana cookies som standard, och då skulle kunden se utloggad ut. Om båda låg under samma domän (till exempel genom att Vercel vidarebefordrar anrop till backend) skulle problemet försvinna.

### Konton, utloggning och val jag har gjort

- **Konton:** shoppen har ingen lösenordsinloggning för kunder, bara för admin, och den är helt separat (miljövariabler, inte tabellen `customers`). Därför kan en kunds e-postadress inte krocka med ett lösenordskonto. Om två olika Google-konton skulle ha samma e-postadress får de olika `sub` och blir två separata kunder. Jag slår aldrig ihop konton på e-post, eftersom det skulle kunna låta någon ta över ett annat konto.
- **Utloggning:** utloggningen tar bort kunden ur shoppens session, men kunden är fortfarande inloggad hos Google, så en ny inloggning går snabbt (Google frågar inte igen, eftersom kunden redan har godkänt appen).
- **Skydd:** Mina sidor är skyddade på servern (`GET /customer/orders` svarar 401 utan inloggning), och servern hämtar bara de beställningar som hör till kunden i sessionen, så ingen kan se någon annans order. En order som görs inloggad kopplas till kunden via sessionen på servern, och React skickar aldrig något kund-id.