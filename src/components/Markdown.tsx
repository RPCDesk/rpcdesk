import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { marked, Renderer } from "marked";
import { openExternal } from "../lib/tauri";

const renderer = new Renderer();
renderer.code = ({ text, lang }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  return `<pre><code class="hljs">${highlighted}</code></pre>`;
};

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, {
      gfm: true,
      breaks: true,
      renderer,
    }) as string;
    return DOMPurify.sanitize(raw);
  }, [text]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    void openExternal(href);
  };

  return (
    <div
      className="prose-agent"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
