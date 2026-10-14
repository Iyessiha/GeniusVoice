# GeniusVoice

Accueil vocal IA multi-établissements. Un agent qui répond à voix haute sur le site
d'un client, renseigne ses visiteurs à partir d'une base de connaissances, prend
des rendez-vous dans ses créneaux réels, qualifie ses prospects et transfère ce
qu'il ne doit pas traiter.

Canal : **widget web** (WebRTC navigateur ↔ OpenAI Realtime). Pas de téléphonie —
voir « Ce qui n'est pas fait ».

## Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Styles | Tailwind 4 + jetons CSS (`src/styles/globals.css`) |
| Base | Postgres (Supabase) via Drizzle ORM + `pg` |
| Auth | sessions maison — scrypt + cookie httpOnly |
| Voix | OpenAI Realtime, `gpt-realtime-2.1`, transport WebRTC |
| Paiement | GeniusPay (mobile money, FCFA) |

Même stack que GeniusCrea, délibérément : l'auth, la facturation et les
conventions de données sont transposables entre les deux produits.

## Installation

Node 22 récent recommandé (au minimum 22.12 pour les outils de test).

```bash
npm ci
cp .env.example .env.local     # puis renseigner les variables
```

**Base de données** — exécuter `supabase/install.sql` dans l'éditeur SQL de
Supabase. Ce fichier contient le schéma complet plus deux index que Drizzle
n'exprime pas (recherche plein texte française, collisions de rendez-vous).
En développement, `npm run db:push` suffit, mais applique le schéma *sans* ces
index.

**Variables indispensables**

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne Postgres Supabase (pooler) |
| `OPENAI_API_KEY` | Jamais exposée au navigateur — voir ci-dessous |
| `GENIUSPAY_API_KEY` / `_SECRET` | Initialisation et vérification des paiements |
| `GENIUSPAY_WEBHOOK_SECRET` | Signature HMAC du webhook. Sans lui, le webhook répond 503 |
| `NEXT_PUBLIC_APP_URL` | Origine publique. Sert au snippet d'intégration et au contrôle d'origine |

```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm test             # tests voix / widget / compteur (prestataires et DB simulés)
npm run build
```

## Comment une conversation se déroule

```
Navigateur du visiteur                  Notre serveur                    OpenAI
──────────────────────                  ─────────────                    ──────
1. clic « Démarrer »
   POST /api/realtime/session ────────▶ clé publique + origine vérifiées
                                        solde de minutes vérifié
                                        conversation ouverte en base
                                        prompt construit depuis la base
                                        POST /v1/realtime/client_secrets ──▶
                                   ◀──── jeton éphémère
   ◀──────────────────────────────────── jeton + phrase d'accueil

2. getUserMedia + RTCPeerConnection
   POST /v1/realtime/calls (SDP) ─────────────────────────────────────────▶
   ◀───────────────────────────────────────────────────── réponse SDP
   canal de données « oai-events » ouvert

3. l'agent veut appeler un outil
   POST /api/realtime/tool ───────────▶ outil autorisé ? conversation à ce
                                        tenant ? → exécution SQL
   ◀──────────────────────────────────── résultat
   function_call_output + response.create ───────────────────────────────▶

4. toutes les 15 s
   POST /api/realtime/heartbeat ──────▶ durée recalculée depuis started_at
                                        solde débité, trace d'usage écrite
   ◀──────────────────────────────────── shouldStop ?
```

### Points qui ne sont pas négociables

**La clé OpenAI ne quitte jamais le serveur.** Le navigateur reçoit un secret
éphémère déjà contraint à un modèle, une voix, un prompt et une liste d'outils.
Recopié, il ne donne accès à rien d'autre. (`src/lib/realtime.ts`)

**Les outils s'exécutent côté serveur.** Le widget relaie, il ne décide pas.
L'autorisation est relue sur l'agent en base, pas sur ce que prétend le client :
un visiteur qui bidouille la console ne peut ni forger un rendez-vous, ni lire
les données d'un autre tenant, ni appeler un outil décoché.
(`src/app/api/realtime/tool/route.ts`, `src/lib/tools.ts`)

**Le compteur clôturé est terminal.** La durée est recalculée côté serveur
à partir de `conversations.started_at` tant que la conversation est active.
Après clôture, une relève tardive ne débite plus rien et ne modifie pas la fin.
Le micro est demandé avant de créer la session. Les relèves restent déclenchées
par le navigateur : clôture `keepalive` best-effort, aucune garantie de rattrapage
après fermeture brutale. La supervision indépendante du flux OpenAI, la
réservation atomique de budget et les sessions abandonnées restent à traiter.
(`src/lib/minutes.ts`, audit A04)

**Les minutes ne sont créditées que par le webhook vérifié.** Le checkout écrit
une ligne `payments` *avant* la redirection. Le webhook vérifie la signature,
revérifie le paiement auprès de GeniusPay, puis crédite — sous verrou de ligne,
avec transition `pending → paid` unique. Les métadonnées de l'événement ne
décident de rien. (`src/lib/payments.ts`)

**La clé publique du widget n'authentifie personne.** Elle est visible dans le
HTML du client, par conception. Ce qui protège son compte, c'est la liste de
domaines autorisés (`businesses.allowed_domains`) : un business sans domaine
déclaré n'accepte que notre propre origine. Les en-têtes CORS reflètent une
origine déjà validée — jamais `*`. (`src/lib/tenant.ts`, `src/lib/widget-auth.ts`)

**L'agent n'invente rien.** Le prompt lui interdit d'affirmer un tarif, une
disponibilité ou une procédure absente de ses consignes : il appelle
`lookup_knowledge`, et s'il ne trouve pas, il le dit et propose un transfert.
Le cadrage par secteur ajoute les interdits du métier — pas de diagnostic pour
une clinique, pas de conseil juridique pour un cabinet. (`src/lib/agent-prompt.ts`)

## Intégration chez le client

Une ligne :

```html
<script src="https://votre-domaine/widget.js" data-key="gv_…" defer></script>
```

Le script injecte une iframe (`/embed/[publicKey]`) avec `allow="microphone"`.
L'iframe isole notre CSS du site hôte dans les deux sens et laisse le navigateur
négocier le micro proprement. Options : `data-position="left"`,
`data-offset="30"`. Depuis le code du client, `window.GeniusVoice.open()`.

Les clients sans site web partagent `/sites/[slug]` : une page publique par
établissement, avec horaires, prestations, FAQ et le widget.

## Carte du code

```
src/
  db/schema.ts          14 tables. Tout est porté par business_id
  lib/
    realtime.ts         jeton éphémère + configuration de session
    agent-prompt.ts     prompt système, cadrage par secteur
    tools.ts            6 outils : définitions + exécuteurs SQL
    minutes.ts          compteur d'usage, débit idempotent
    tenant.ts           résolution du tenant, contrôle d'origine
    widget-auth.ts      garde des routes publiques du widget
    api-guard.ts        garde d'appartenance des routes du tableau de bord
    queries.ts          lectures partagées pages serveur / routes GET
    timezone.ts         heure murale ↔ UTC, sans dépendance
    payments.ts         GeniusPay : init, vérification, règlement
  hooks/useRealtimeVoice.ts   transport WebRTC, relais d'outils, relève
  components/VoiceWidget.tsx  interface vocale (nos pages + iframe)
```

### Les outils de l'agent

| Outil | Effet |
|---|---|
| `lookup_knowledge` | Recherche plein texte française dans la base du tenant |
| `list_services` | Catalogue avec durées et tarifs |
| `check_availability` | Créneaux libres, horaires et rendez-vous pris déduits |
| `book_appointment` | Enregistre le rendez-vous, avec contrôle de collision |
| `capture_lead` | Prospect qualifié, refuse sans moyen de rappel |
| `transfer_to_human` | Renvoie le numéro de transfert, marque la conversation |

Chaque outil est activable par agent. Un outil décoché ne s'exécute pas.

## Ce qui n'est pas fait

À connaître avant de vendre :

- **Pas de téléphonie.** Le produit est un widget web. Des vrais numéros
  entrants et sortants demandent Twilio ou Telnyx, du SIP, du provisionnement
  et de la conformité télécom. Le schéma prévoit la place
  (`conversations.channel`), rien de plus.
- **Pas de vérification d'e-mail à l'inscription.** La colonne et le champ
  existent, le flux n'est pas branché.
- **Pas d'envoi d'e-mails.** Pas de confirmation de rendez-vous ni de reçu de
  paiement. `appointments.confirm_token` est généré et jamais exposé par l'API,
  en attendant la route de confirmation.
- **Pas d'administration interne.** Aucune console pour suspendre un compte ou
  créditer des minutes à la main (il faut passer par SQL).
- **Limiteur de débit en mémoire.** Correct sur une instance, à remplacer par
  Redis dès qu'il y a plusieurs régions.
- **Rappels et relances absents.** Aucun cron ne rappelle un rendez-vous ni ne
  relance un prospect.
- **Tests partiels.** `npm test` couvre le cycle de vie vocal, les commandes et
  réglages du widget, le compteur terminal et le crédit transactionnel. Réseau,
  WebRTC et DB sont simulés : tests d'intégration Postgres, prestataires réels,
  multi-navigateur et pipeline CI restent à ajouter.

## Audit et suivi des corrections

- [Audit initial du 14/10/2026](docs/AUDIT-2026-10-14.md)
- [Suivi d'implémentation](docs/IMPLEMENTATION-STATUS.md)

Les correctifs actuels ne rendent pas encore le SaaS prêt à une ouverture
publique : protection de l'iframe, supervision des coûts, réservations et
mises à jour de sécurité restent prioritaires.

---

MonWe Infinity LLC
