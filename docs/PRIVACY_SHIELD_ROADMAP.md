# KDL Privacy Shield — roadmap (préparation, non actif)

Bouclier anti-traqueurs **préparé, pas encore actif** : aucune requête n'est bloquée
tant que le module n'est pas testé et activé volontairement.

## Architecture prévue
- Observateur de requêtes (`session.webRequest.onBeforeRequest`, processus principal).
- Détection première/tierce partie (comparaison eTLD+1 vs domaine de la page).
- Compteur par page ; liste blanche locale par domaine.
- Niveaux : **Désactivé · Standard · Strict**. Désactivation rapide par site.
- Journal limité, **non persistant par défaut**.

## Points d'interception / limites
- `webRequest` : un seul handler `onBeforeRequest` effectif ; ordre des gestionnaires à
  maîtriser ; risque de **casser des sites** (CDN, auth, paiements) → liste blanche + niveau
  Standard prudent par défaut.
- Ne pas bloquer sur les pages sensibles/paiement.

## Rollback
Le module est isolé : le désactiver rétablit une navigation identique à aujourd'hui
(aucun blocage). Rien n'est persistant.

## Futur
Complément possible avec **KDL DNS Shield** (filtrage réseau) — cohérence des listes.
