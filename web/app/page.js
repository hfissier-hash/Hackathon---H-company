import { redirect } from 'next/navigation';

// Les écrans de l'application sont dans public/ecrans ; l'accueil y renvoie.
export default function Home() {
  redirect('/ecrans/accueil.html');
}
