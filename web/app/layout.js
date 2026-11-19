export const metadata = { title: 'Nester', description: 'Meublez votre salon avec de vrais produits qui rentrent, en 3D.' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
