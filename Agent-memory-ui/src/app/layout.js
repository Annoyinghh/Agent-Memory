import './workspace.css';
import { AppProvider } from '@/context/AppContext';

export const metadata = {
  title: 'Agent Memory · Code Intelligence',
  description: '本地代码索引、关系追踪与 Agent 记忆工作台',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
