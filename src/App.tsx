import AduanaDashboard from './components/AduanaDashboard';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <AduanaDashboard />
      <Toaster position="top-right" richColors />
    </>
  );
}
