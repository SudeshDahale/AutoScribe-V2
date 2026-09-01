import re

with open("frontend/src/routes/_app.ask.tsx", "r", encoding="utf-8") as f:
    content = f.read()

hook_code = """
function useAutoScroll(dependencies: any[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Check if we are within 100px of the bottom
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setIsAtBottom(atBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isAtBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, dependencies);

  return containerRef;
}
"""

content = content.replace("function CodeBlock", hook_code + "\nfunction CodeBlock")

content = content.replace('const bottomRef = useRef<HTMLDivElement>(null);', 'const bottomRef = useRef<HTMLDivElement>(null);\n  const chatContainerRef = useAutoScroll([streamingMessage?.text, pendingQuestion, messages]);')

content = content.replace('<div className="flex-1 min-h-0 overflow-y-auto">', '<div className="flex-1 min-h-0 overflow-y-auto" ref={chatContainerRef}>')

with open("frontend/src/routes/_app.ask.tsx", "w", encoding="utf-8") as f:
    f.write(content)
