import type { ReactNode } from "react";

export const metadata = {
  title: "ALX Threads Autoposter",
  description: "Durable Threads scheduler for ALX Oracle",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui", maxWidth: 860, margin: "40px auto", padding: "0 20px", lineHeight: 1.55 }}>
        {children}
      </body>
    </html>
  );
}
