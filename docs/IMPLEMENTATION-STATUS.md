# Suivi des recommandations — GeniusVoice

## Lot en cours : socle fiable, dans l'ordre

| Étape | Statut | Portée |
|---|---|---|
| 1. Parcours vocal (A01/A14/A15) | Correctifs implémentés, tests locaux validés | Cycle de vie, annulation, retry, réglages widget |
| 2. Compteur terminal (A03) | Correctif implémenté, tests locaux validés | Plus de débit après clôture, crédit transactionnel |
| 3. Réservation fiable (A06/A07) | À faire ensuite | Règles partagées, horaires, concurrence, contrainte Postgres |
| 4. Dépendances de sécurité (A05) | À faire | Next/ESLint/PostCSS/Sharp ; ne pas utiliser audit fix --force aveuglément |
| 5. CI et intégration | Base de tests créée, pipeline à faire | Tests Postgres, prestataires et multi-navigateur encore requis |

L'[audit initial](AUDIT-2026-10-14.md) est conservé comme état de référence.
Ces correctifs **ne lèvent pas tous les blocages de mise en production**.

## Étape 1 — Parcours vocal

- Callbacks utilisateur indépendants du nettoyage de cycle de vie ; les changements de transcript, de statut, de mute et les re-rendus ne clôturent plus l'appel.
- Garde de tentative dès le premier clic pour empêcher un double démarrage.
- Permission du microphone demandée avant de créer une conversation serveur.
- Bouton Annuler pendant la connexion ; fermer l'iframe annule aussi une connexion non encore active.
- Tracks d'un retour micro tardif stoppées ; réponses SDP et erreurs d'une ancienne tentative ignorées.
- Session renvoyée après annulation clôturée sans ouvrir de peer connection.
- Résultat outil tardif jamais transmis à une nouvelle session.
- Nettoyage unique des ressources et du compteur sur raccrochage, pagehide ou unmount.
- Retry possible après erreur et réinitialisation de l'état du prochain appel.
- Connexion limitée à 45 s ; requêtes API limitées à 15 s ; arrêt après trois échecs consécutifs de relève et protection contre les relèves simultanées.
- Durée maximale locale appliquée ; **ce n'est pas une garantie contre un navigateur modifié**.
- Domaines et couleur préremplis depuis les valeurs serveur.

## Étape 2 — Compteur

- Lecture de la conversation sous verrou de ligne ; tout statut autre qu'active retourne un état terminal sans écriture.
- Durée et date de fin immuables après clôture ; aucune nouvelle consommation lors d'un heartbeat/finalize tardif.
- Compteur monotone même si l'horloge recule.
- Clôture effective sur épuisement ou durée maximale, même lorsqu'il n'y a pas de nouveau delta.
- Débit, événement d'usage et clôture dans la même transaction.
- `creditSeconds` crédite désormais le solde et inscrit l'événement dans une seule transaction.
- Commentaires et README rectifiés : aucune promesse de rattrapage automatique ou de découvert borné à 15 s.

## Validation locale

30 tests automatisés dans quatre fichiers :

```bash
npm ci
npm test
npm run typecheck
npm run lint
```

- 13 tests du hook vocal : StrictMode, re-rendu, double clic, annulation, retours tardifs, retry, démontage, timeouts, perte de relève, durée maximale, résultats outils obsolètes.
- 3 tests des commandes du widget : retry, annulation, fermeture pendant connexion.
- 1 test de conservation des réglages widget.
- 13 tests compteur/crédit : delta, rejeu, terminal failed/ended, clôture à zéro, limites, horloge, transaction sérialisée simulée et rollback.

Node 22 récent recommandé (tests exécutés avec 22.22.3). Installation propre `npm ci`, 30 tests, typecheck et lint validés. Build de compilation validé avec une URL Postgres factice ; cela ne valide pas une connexion ou un schéma de base réel.

Les tests React utilisent jsdom et les APIs WebRTC simulées. Les tests compteur utilisent un adaptateur transactionnel simulé : ils vérifient la logique, **pas les verrous et garanties du vrai Postgres**.

## Limitations à ne pas confondre avec les correctifs

- La facturation démarre encore à la création serveur, pas à un événement de connexion audio attesté. La permission micro ne consomme plus ce temps, mais la négociation reste comprise.
- Un timeout lors du minting, une fermeture brutale ou une relève perdue peuvent toujours laisser une session orpheline. Le keepalive client est best-effort.
- La supervision serveur OpenAI, la réservation atomique du budget, les limites de sessions simultanées et la protection des domaines iframe (A02/A04) restent à implémenter.
- Les garanties de réservation, la validation stricte des dates et les dépendances vulnérables n'ont pas encore été corrigées.
- Aucun appel OpenAI réel, paiement GeniusPay réel ou test contre une base Supabase réelle effectué.
- Pas de migration SQL requise pour les correctifs de ce lot.
