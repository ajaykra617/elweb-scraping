import "./globals.css";
import SidebarClient from "./sidebar-client";  // client component

export const metadata = {
  title: "elweb Dashboard",
  description: "Elweb scraping dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex bg-gray-50">

          <aside className="w-64 bg-white border-r p-4">
            <SidebarClient />
          </aside>

          <main className="flex-1 p-6">{children}</main>

        </div>
      </body>
    </html>
  );
}