export const metadata = {
  title: 'JH-Tools | Next-Gen Digital Platform',
  description: 'Platform tools tercanggih',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-[#030014]">{children}</body>
    </html>
  );
}
