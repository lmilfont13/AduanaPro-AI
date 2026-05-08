import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Paperclip, X, FilePlus2, RefreshCw, Sparkles, User, ShieldCheck } from 'lucide-react';
import { chatWithSpecialist } from '../services/geminiService';
import { chatWithSpecialistWithGroq } from '../services/groqService';
import { toast } from 'sonner';

interface CustomsChatProps {
  aiEngine: "gemini" | "groq";
}

export const CustomsChat = React.memo(({ aiEngine }: CustomsChatProps) => {
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: 'Bem-vindo ao canal de inteligência Mamoeiro. Sou seu especialista em logística e legislação aduaneira. Como posso acelerar seu processo hoje?' }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory]);

  const handleSend = async () => {
    if (!chatInput.trim() || loading) return;
    const userMsg = chatInput;
    const newHistory = [...chatHistory, { role: 'user' as const, content: userMsg }];
    setChatInput("");
    setChatHistory(newHistory);
    setLoading(true);
    try {
      let response;
      if (aiEngine === "gemini") {
        response = await chatWithSpecialist(userMsg, newHistory);
      } else {
        response = await chatWithSpecialistWithGroq(newHistory);
      }
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error: any) {
      toast.error("Erro no Chat: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-[800px] flex flex-col bg-white rounded-[56px] border border-slate-200 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-700">
      <header className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-md">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-slate-900 rounded-[28px] flex items-center justify-center text-white shadow-2xl shadow-slate-900/20"><Bot size={32} /></div>
           <div><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Aduana Specialist AI</h2><div className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocolo de Segurança Ativo</p></div></div>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => setChatHistory([{ role: 'assistant', content: 'Interface reiniciada.' }])} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:shadow-lg"><RefreshCw size={20} /></button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-8 bg-white custom-scrollbar">
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex flex-col gap-2 max-w-[80%]">
              <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{msg.role === 'user' ? 'Você (Luciano)' : 'Mamoeiro AI'}</span>
              </div>
              <div className={`p-8 rounded-[40px] text-sm font-medium leading-relaxed ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none shadow-2xl shadow-slate-900/10' : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100'}`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
             <div className="flex flex-col gap-2">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 animate-bounce"><Sparkles size={16} /></div>
                <div className="bg-slate-50 p-6 rounded-[32px] rounded-tl-none border border-slate-100"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" /></div></div>
             </div>
          </div>
        )}
      </div>

      <footer className="p-8 border-t border-slate-100 bg-slate-50/30">
        <div className="max-w-4xl mx-auto relative flex items-center gap-4">
           <div className="flex-1 relative group">
              <input placeholder="Digite sua dúvida técnica ou jurídica..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="w-full p-6 pl-8 bg-white border border-slate-200 rounded-[32px] font-bold text-sm focus:ring-4 focus:ring-slate-900/5 transition-all outline-none pr-20" />
              <button onClick={handleSend} disabled={loading || !chatInput.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 bg-slate-900 text-white rounded-[24px] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50"><Send size={24} /></button>
           </div>
        </div>
      </footer>
    </div>
  );
});
