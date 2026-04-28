export const metadata = {
  title: "Hwood Engines",
  description: "Operational engines for Hwood Group venues — capacity planning, inventory workflow, and procurement.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
