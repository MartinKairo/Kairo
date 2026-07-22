// Constantes du "marché" fictif de Kairo (achat/vente de parts de startups
// avec du capital fictif). Partagé entre le composant client (affichage,
// calculs optimistes) et la route API app/api/trade/route.js (calcul du prix
// côté serveur, qui fait foi en cas de désaccord).
export const SHARE_PRICE_MULTIPLIER = 10;
export const STARTING_CASH = 10000; // valeur de repli si la ligne "portfolio" n'existe pas encore en base
