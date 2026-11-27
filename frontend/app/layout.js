export const metadata = { title: "DevSpace Sandbox" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "3rem auto", padding: "0 1rem" }}>
        {children}
      </body>
    </html>
  );
}
