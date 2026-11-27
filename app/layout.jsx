import "./globals.css";

export const metadata = {
  title: "Agentic Timetable | Smart Schedule Explorer & Assistant",
  description:
    "AI-assisted university schedule explorer, clash auditor, room finder, and ICS exporter"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
