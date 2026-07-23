// Constantes du "marché" fictif de Kairo (achat/vente de parts de startups
// avec du capital fictif). Partagé entre le composant client (affichage,
// calculs optimistes) et la route API app/api/trade/route.js (calcul du prix
// côté serveur, qui fait foi en cas de désaccord).
export const SHARE_PRICE_MULTIPLIER = 10;
// 1 000 K¢ (voir aussi supabase/012_lower_starting_cash.sql pour la valeur
// réelle appliquée en base à l'inscription) = 100 000 € de pouvoir
// d'investissement simulé (1 K¢ = 100 €, voir EUR_PER_KC dans
// lib/investing/equity.js) — abaissé depuis 10 000 K¢ (500 M€ à l'ancien
// taux de 50 000 €/K¢), qui permettait de racheter plusieurs % d'une
// licorne valorisée plusieurs milliards d'un seul coup, cassant le côté
// "position minoritaire d'un petit investisseur" (voir brief 2026-07-24).
// Cette constante ne sert que de valeur de repli si la ligne "portfolio"
// n'existe pas encore en base ; la vraie valeur de départ pour un nouvel
// utilisateur vient du trigger SQL handle_new_user (006/012).
export const STARTING_CASH = 1000;
