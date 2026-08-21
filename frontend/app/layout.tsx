import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskDocs - PDF Chatbot",
  description: "Securely upload and chat with your digital PDF documents using local vector embeddings and Groq LLM",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-zinc-50 text-zinc-900 flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
