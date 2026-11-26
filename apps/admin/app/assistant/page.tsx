"use client";
import { useEffect,useState } from "react";
import { Bot,ArrowRight,Loader2 } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { api } from "../../lib/api";
export default function Assistant(){
 const [enabled,setEnabled]=useState<boolean|null>(null),[message,setMessage]=useState(""),[reply,setReply]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{api<{enabled:boolean}>("/admin/ai/status").then(x=>setEnabled(x.enabled)).catch(()=>setEnabled(false))},[]);
 async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{const result=await api<{reply:string}>("/admin/ai/chat",{method:"POST",body:JSON.stringify({message})});setReply(result.reply)}catch(e){setError(e instanceof Error?e.message:"Request failed")}finally{setBusy(false)}}
 return <AppShell><h1>Workspace assistant</h1><p className="mt-2 text-sm text-slate-500">Read-only documentation assistant. Does not query your database or perform actions.</p><div className="card mt-6 max-w-3xl p-6"><div className="mb-4 flex items-center gap-2 font-semibold"><Bot size={20}/> Open Core assistant</div>{enabled===null?<p role="status">Loading…</p>:!enabled?<p>Not enabled for this deployment or account.</p>:<form onSubmit={send} className="space-y-4"><label className="block">Your question<textarea required maxLength={8000} className="input-base mt-2 min-h-32" value={message} onChange={e=>setMessage(e.target.value)}/></label><p className="text-xs text-slate-500">Your message is sent to the configured external provider. Do not enter passwords or sensitive data.</p><button className="btn-primary" disabled={busy||!message.trim()}>{busy?<Loader2 className="animate-spin" size={16}/>:<ArrowRight size={16}/>} Ask</button></form>}{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}{reply&&<div aria-live="polite" className="mt-6 whitespace-pre-wrap border-t border-slate-200 pt-4 text-sm leading-7">{reply}</div>}</div></AppShell>
}
