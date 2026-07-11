# Confidentialité de l'IA

L'IA n'analyse une page **qu'à la demande explicite** de l'utilisateur. Aucune analyse
automatique des onglets, aucun observateur permanent.

## Fourni au moteur (minimum)
Titre, URL publique, **sélection** ou texte visible strictement nécessaire, tronqué
(≤ 6000 caractères). Rien d'autre.

## JAMAIS fourni
Mots de passe, cookies, tokens, localStorage/sessionStorage, valeurs de formulaire,
champs masqués, contenu bancaire, en-têtes d'autorisation, historique, contenu d'un
autre onglet/fenêtre, pages de connexion.

## Pages sensibles
Détection (banque, paiement, authentification, webmail, admin, pages locales `127.0.0.1`,
`file:`, champ mot de passe présent) → **aperçu du texte + validation explicite** avant
tout traitement.

## Fournisseur distant (Mon IA)
Toute utilisation d'un fournisseur distant affiche une confirmation : le texte va quitter
la machine. Un fournisseur distant n'est **jamais** présenté comme « local ».

## L'IA ne peut pas agir
Pas d'exécution de commande, pas de clic, pas de remplissage de formulaire, pas de
navigation, pas de téléchargement, pas d'exécution de code généré. Assistant de lecture,
d'explication et de rédaction uniquement.
