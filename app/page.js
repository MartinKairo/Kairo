import { supabase } from "@/lib/supabaseClient";
import KairoApp from "@/components/KairoApp";

export default async function Home() {
  const { data: startups, error } = await supabase
    .from("startups")
    .select("*")
    .order("score", { ascending: false });

  if (error) {
    return (
      <div style={{ padding: 40, color: "#FF5C5C" }}>
        Erreur de chargement des startups : {error.message}
      </div>
    );
  }

  return <KairoApp startups={startups} />;
}
