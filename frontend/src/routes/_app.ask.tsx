import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepos } from "@/lib/repo-store";
import { z } from "zod";
import {
  Plus,
  FileCode,
  ChevronDown,
  Copy,
  Check,
  Sparkles,
  SquarePen,
  ChevronRight,
  Loader2,
  ArrowUp,
} from "lucide-react";

const searchSchema = z.object({
  repo: z.string().optional(),
  conversationId: z.string().optional(),
});

export const Route = createFileRoute("/_app/ask")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Ask AI · AutoScribe" },
      { name: "description", content: "Chat with your codebase" },
    ],
  }),
  component: AskPage,
});

type Message = {
  role: "user" | "assistant";
  text: string;
  flow: { label: string; meta: string }[];
  files: { name: string; path: string }[];
  followups: string[];
};
type Conversation = { id: number; title: string; created_at: string };

const SUGGESTED = [
  "What does this repository do?",
  "Where is authentication handled?",
  "What's the overall architecture?",
  "How are database models structured?",
  "List the main API endpoints",
  "How do I run this project locally?",
];

function groupByDate(convs: Conversation[]) {
  const now = new Date();
  const buckets: Record<string, Conversation[]> = {
    Today: [], Yesterday: [], "Previous 7 days": [], Older: [],
  };
  convs.forEach((c) => {
    const diff = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / 86400000);
    if (diff < 1) buckets["Today"].push(c);
    else if (diff < 2) buckets["Yesterday"].push(c);
    else if (diff < 7) buckets["Previous 7 days"].push(c);
    else buckets["Older"].push(c);
  });
  return Object.entries(buckets).filter(([, items]) => items.length > 0);
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function Markdown({ text }: { text: string }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copy = (code: string, i: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const codeRx = /```(\w*)\n?([\s\S]*?)```/g;
  const parts: { type: "text" | "code"; content: string; lang?: string }[] = [];
  let last = 0; let m: RegExpExecArray | null; let ci = 0;
  while ((m = codeRx.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "text", content: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });

  const formatInline = (str: string) => {
    return str
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-400 hover:underline inline-flex items-center gap-0.5">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, "<strong class=\"font-semibold text-white\">$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-white/10 text-[13px] font-mono text-white/90">$1</code>');
  };

  return (
    <div className="prose-ai space-y-4">
      {parts.map((p, i) => {
        if (p.type === "code") {
          const idx = ci++;
          return (
            <div key={i} className="my-4 rounded-xl overflow-hidden border border-white/10 bg-[#1a1a1a] font-mono">
              <div className="flex items-center justify-between px-4 py-2 bg-[#222] border-b border-white/10">
                <span className="text-[11px] text-white/40 font-medium">{p.lang || "code"}</span>
                <button onClick={() => copy(p.content, idx)} className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/80 transition">
                  {copiedIdx === idx ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copiedIdx === idx ? "Copied!" : "Copy code"}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-white/85 whitespace-pre">{p.content}</pre>
            </div>
          );
        }

        return (
          <div key={i} className="space-y-3">
            {p.content.split(/\n\n+/).map((para, j) => {
              const trimmed = para.trim();

              // Table parsing
              if (trimmed.includes("|") && trimmed.split("\n").length >= 2) {
                const lines = trimmed.split("\n").filter(l => l.trim().startsWith("|"));
                if (lines.length >= 2) {
                  const headerCells = lines[0].split("|").slice(1, -1).map(c => c.trim());
                  // Skip separator line (line 1 with ---)
                  const bodyRows = lines.slice(2).map(r => r.split("|").slice(1, -1).map(c => c.trim()));
                  return (
                    <div key={j} className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.04]">
                            {headerCells.map((h, k) => (
                              <th key={k} className="px-3.5 py-2.5 font-semibold text-white/90" dangerouslySetInnerHTML={{ __html: formatInline(h) }} />
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {bodyRows.map((row, k) => (
                            <tr key={k} className="hover:bg-white/[0.02] transition">
                              {row.map((cell, l) => (
                                <td key={l} className="px-3.5 py-2.5 text-white/80" dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
              }

              // Bullet list
              if (/^[\s]*[-*•]\s/m.test(para)) {
                return (
                  <ul key={j} className="space-y-1.5 pl-1 my-2">
                    {para.split("\n").filter(Boolean).map((l, k) => (
                      <li key={k} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-white/85">
                        <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: formatInline(l.replace(/^[\s]*[-*•]\s/, "")) }} />
                      </li>
                    ))}
                  </ul>
                );
              }

              // Numbered list
              if (/^\d+\.\s/m.test(para)) {
                return (
                  <ol key={j} className="space-y-1.5 pl-1 list-none my-2">
                    {para.split("\n").filter(l => /^\d+\.\s/.test(l)).map((l, k) => {
                      const match = l.match(/^(\d+)\.\s(.+)/);
                      return (
                        <li key={k} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-white/85">
                          <span className="shrink-0 text-white/40 font-mono text-[13px] mt-0.5">{match?.[1]}.</span>
                          <span dangerouslySetInnerHTML={{ __html: formatInline(match?.[2] || "") }} />
                        </li>
                      );
                    })}
                  </ol>
                );
              }

              // Headings
              if (/^#{1,3}\s/.test(para)) {
                const level = para.match(/^(#{1,3})\s/)?.[1].length || 1;
                const titleText = para.replace(/^#{1,3}\s/, "");
                const sizeClass = level === 1 ? "text-[18px] font-bold text-white mt-4 mb-1" : level === 2 ? "text-[16px] font-semibold text-white mt-3 mb-1" : "text-[14.5px] font-semibold text-white/95 mt-2 mb-1";
                return <h3 key={j} className={sizeClass} dangerouslySetInnerHTML={{ __html: formatInline(titleText) }} />;
              }

              // Plain paragraph
              return <p key={j} className="text-[15px] leading-[1.75] text-white/85" dangerouslySetInnerHTML={{ __html: formatInline(para) }} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Smart auto-scroll ─────────────────────────────────────────────────────────

function useSmartScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (pinned.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, deps);
  return ref;
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AskPage() {
  const { repos } = useRepos();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const repoId = search.repo ?? repos[0]?.id ?? "";
  // If conversationId is in the URL, we're viewing an existing chat.
  // If it's absent, this is a NEW chat — show empty state regardless of past convs.
  const urlConvId = search.conversationId ? Number(search.conversationId) : null;

  const [input, setInput] = useState("");
  const [activeConvId, setActiveConvId] = useState<number | null>(urlConvId);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync active conversation with URL
  useEffect(() => { setActiveConvId(urlConvId); }, [urlConvId]);

  // Default repo redirect
  useEffect(() => {
    if (!search.repo && repos[0]?.id) navigate({ to: "/ask", search: { repo: repos[0].id }, replace: true });
  }, [repos, search.repo, navigate]);

  const activeRepo = repos.find(r => r.id === repoId);

  // Fetch conversation list for sidebar
  const convListQ = useQuery({
    queryKey: ["conversations", repoId],
    queryFn: async (): Promise<Conversation[]> => {
      const res = await fetch(`/api/repos/${repoId}/conversations`);
      return res.ok ? res.json() : [];
    },
    enabled: !!repoId,
  });

  // KEY FIX: Only fetch messages when we have an explicit conversationId in the URL.
  // Without a conversationId = new chat = empty state. Never auto-load the latest conv.
  const convMsgsQ = useQuery({
    queryKey: ["conv-messages", repoId, activeConvId],
    queryFn: async (): Promise<{ messages: Message[]; conversationId: number | null }> => {
      const res = await fetch(`/api/repos/${repoId}/conversation?conversation_id=${activeConvId}`);
      return res.ok ? res.json() : { messages: [], conversationId: null };
    },
    enabled: !!repoId && activeConvId !== null, // ← Only fetch when viewing a specific conversation
  });

  const suggestedQ = useQuery({
    queryKey: ["suggested", repoId],
    queryFn: async (): Promise<{ questions: string[] }> => {
      const res = await fetch(`/api/repos/${repoId}/suggested-questions`);
      return res.ok ? res.json() : { questions: SUGGESTED };
    },
    enabled: !!repoId,
  });

  const messages = convMsgsQ.data?.messages ?? [];
  const conversations = convListQ.data ?? [];
  const suggested = suggestedQ.data?.questions?.length ? suggestedQ.data.questions : SUGGESTED;
  // hasChat: true only if we have a real conversation selected AND it has messages (or we're mid-stream)
  const hasChat = (activeConvId !== null && messages.length > 0) || !!pendingMsg;
  const chatRef = useSmartScroll([streamText, pendingMsg, messages.length]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || streaming || !repoId) return;
    setStreaming(true); setStreamText(""); setPendingMsg(q); setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    let finalId = activeConvId;
    try {
      const qs = activeConvId ? `?conversation_id=${activeConvId}` : "";
      const res = await fetch(`/api/repos/${repoId}/ask/stream${qs}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(part.slice(6));
            if (d.token) { acc += d.token; setStreamText(acc); }
            else if (d.done && d.conversationId) finalId = d.conversationId;
            else if (d.error) { acc += `\n\n*Error: ${d.error}*`; setStreamText(acc); }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setStreamText(`Sorry, something went wrong: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      if (finalId) {
        setActiveConvId(finalId);
        qc.invalidateQueries({ queryKey: ["conv-messages", repoId, finalId] });
        qc.invalidateQueries({ queryKey: ["conversations", repoId] });
        navigate({ to: "/ask", search: { repo: repoId, conversationId: String(finalId) }, replace: true });
      }
      setStreaming(false); setPendingMsg(null); setStreamText("");
    }
  }, [streaming, repoId, activeConvId, qc, navigate]);

  const newChat = () => {
    setActiveConvId(null);
    setPendingMsg(null);
    setStreamText("");
    setInput("");
    // Navigate WITHOUT conversationId — this is the key to showing empty state
    navigate({ to: "/ask", search: { repo: repoId }, replace: true });
  };

  const groups = groupByDate(conversations);

  // Height = viewport minus topbar (h-14 = 56px). This is the most reliable way
  // to make a fixed-height container inside the global shell without restructuring the layout.
  const CONTENT_HEIGHT = "calc(100vh - 56px)";

  return (
    <div
      id="ask-ai-container"
      className="flex w-full overflow-hidden bg-[#212121]"
      style={{ height: CONTENT_HEIGHT }}
    >
      {/* ── Conversation sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col bg-[#171717] border-r border-white/[0.06]" style={{ height: CONTENT_HEIGHT }}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 pl-1">
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-black" />
            </div>
            <span className="text-[13px] font-semibold text-white/80">Ask AI</span>
          </div>
          <button onClick={newChat} title="New chat"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition">
            <SquarePen className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Repo picker - only if multiple repos */}
        {repos.length > 1 && (
          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <select value={repoId}
                onChange={e => { setActiveConvId(null); navigate({ to: "/ask", search: { repo: e.target.value }, replace: true }); }}
                className="w-full appearance-none bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white/60 focus:outline-none cursor-pointer pr-6">
                {repos.map(r => <option key={r.id} value={r.id} className="bg-[#1a1a1a]">{r.org}/{r.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
            </div>
          </div>
        )}

        {/* New chat button */}
        <div className="px-2 pb-2 shrink-0">
          <button onClick={newChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/50 hover:text-white hover:bg-white/[0.07] transition">
            <Plus className="w-3.5 h-3.5" /> New chat
          </button>
        </div>

        {/* Scrollable conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
          {groups.length === 0
            ? <p className="px-3 py-4 text-[11px] text-white/25 text-center">No conversations yet</p>
            : groups.map(([label, items]) => (
              <div key={label} className="mb-4">
                <p className="px-3 pb-1 text-[10px] font-medium text-white/25 uppercase tracking-wider">{label}</p>
                {items.map(c => (
                  <button key={c.id}
                    onClick={() => { setActiveConvId(c.id); navigate({ to: "/ask", search: { repo: repoId, conversationId: String(c.id) } }); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[12px] truncate transition mb-0.5 ${activeConvId === c.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/[0.06]"}`}>
                    {c.title || "New conversation"}
                  </button>
                ))}
              </div>
            ))
          }
        </div>
      </aside>

      {/* ── Main chat ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden" style={{ height: CONTENT_HEIGHT }}>

        {/* Scrollable messages area */}
        <div ref={chatRef} className="flex-1 overflow-y-auto flex flex-col">
          {!hasChat ? (
            /* ── Welcome / empty state ─────────────────────────────────── */
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
              <div className="mb-6 relative flex items-center justify-center">
                <div className="absolute w-16 h-16 rounded-full bg-white/[0.07] animate-ping" style={{ animationDuration: "3s" }} />
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg relative z-10">
                  <Sparkles className="w-5 h-5 text-black" />
                </div>
              </div>
              <h1 className="text-[26px] font-bold text-white mb-2 tracking-tight">What can I help with?</h1>
              {activeRepo && (
                <p className="text-[13px] text-white/35 mb-8">
                  Searching <span className="text-white/55 font-medium">{activeRepo.org}/{activeRepo.name}</span>
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[600px]">
                {suggested.slice(0, 6).map(q => (
                  <button key={q} onClick={() => ask(q)}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#2f2f2f] hover:bg-[#383838] border border-white/[0.07] hover:border-white/[0.14] transition text-left group">
                    <span className="text-[12.5px] text-white/65 group-hover:text-white/85 transition leading-snug">{q}</span>
                    <ArrowUp className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 shrink-0 transition" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Message thread ──────────────────────────────────────────── */
            <div className="max-w-[680px] mx-auto w-full px-4 py-8 space-y-7 pb-36">
              {messages.map((msg, idx) =>
                msg.role === "user" ? (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[80%] bg-[#2f2f2f] rounded-3xl px-5 py-3 text-[15px] leading-relaxed text-white whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-black" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <Markdown text={msg.text} />
                      {msg.files?.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {msg.files.map((f, i) => (
                            <a key={i}
                              href={activeRepo ? `https://github.com/${activeRepo.org}/${activeRepo.name}/blob/${activeRepo.branch}/${f.path}` : "#"}
                              target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition text-[11px] text-white/50 hover:text-white/80">
                              <FileCode className="w-3 h-3 text-white/25 shrink-0" />{f.name}
                            </a>
                          ))}
                        </div>
                      )}
                      {msg.followups?.length > 0 && (
                        <div className="mt-4 space-y-1.5">
                          {msg.followups.map((q, i) => (
                            <button key={i} onClick={() => ask(q)}
                              className="flex items-center justify-between gap-3 w-full text-left px-4 py-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#333] border border-white/[0.07] hover:border-white/[0.14] transition group">
                              <span className="text-[13px] text-white/60 group-hover:text-white/80 transition">{q}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* Optimistic user message while waiting for stream to start */}
              {pendingMsg && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-[#2f2f2f] rounded-3xl px-5 py-3 text-[15px] leading-relaxed text-white whitespace-pre-wrap">
                    {pendingMsg}
                  </div>
                </div>
              )}

              {/* Streaming assistant response */}
              {(streaming || streamText) && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className={`w-3 h-3 text-black ${streaming && !streamText ? "animate-pulse" : ""}`} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    {streamText ? (
                      <>
                        <Markdown text={streamText} />
                        {streaming && <span className="inline-block w-0.5 h-4 bg-white/60 ml-0.5 animate-pulse rounded-sm align-middle" />}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 py-2">
                        {[0, 160, 320].map(d => <span key={d} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* ── Floating input bar ──────────────────────────────────────────── */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 pointer-events-none"
          style={{ background: "linear-gradient(to top, #212121 60%, transparent)" }}>
          <div className="max-w-[680px] mx-auto pointer-events-auto">
            <div className="flex items-end gap-3 bg-[#2f2f2f] rounded-2xl border border-white/10 px-4 py-3 shadow-2xl focus-within:border-white/[0.22] transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                placeholder="Ask anything about your codebase…"
                rows={1} disabled={streaming}
                className="flex-1 resize-none bg-transparent text-[14.5px] text-white placeholder:text-white/30 focus:outline-none leading-relaxed disabled:opacity-50"
                style={{ minHeight: "24px", maxHeight: "160px" }}
              />
              <button onClick={() => ask(input)} disabled={!input.trim() || streaming}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 hover:bg-white/85 transition disabled:opacity-25 disabled:cursor-not-allowed">
                {streaming
                  ? <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
                  : <ArrowUp className="w-3.5 h-3.5 text-black" />
                }
              </button>
            </div>
            <p className="text-center text-[11px] text-white/20 mt-2">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
