import Markdown from "react-markdown";

export function SharedMarkdown({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>;
}
