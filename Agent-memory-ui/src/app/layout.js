import './globals.css';
import { AppProvider } from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const metadata = {
  title: 'Agent Memory Control Center',
  description: 'Futuristic dashboard for local Agent Memory database management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <AppProvider>
          <div className="layout-wrapper">
            <Sidebar />
            <main className="main-content">
              <Header />
              <div className="page-view-container">{children}</div>
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
